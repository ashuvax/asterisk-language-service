import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function getDocumentation(docURL) {
    console.log('Fetching documentation for AGI at', docURL);

    try {
        const docResponse = await axios.get(docURL);
        const doc$ = cheerio.load(docResponse.data);
        const article = doc$('article');

        const synopsis = article.find('h3#synopsis').next('p').text().trim();
        const description = article.find('h3#description').next('p').text().trim();
        const syntax = article.find('h3#syntax').next('div.language-text').find('code').text().trim();

        // arg example: { name: 'arg1', description: 'Description of arg1', required: true }
        const args = [];
        const argsList = article.find('h5#arguments').next('ul').find('li');
        console.log("🚀 ~ getDocumentation ~ argsList:", argsList)
        /**
         * <ul> <li> <p><code>command</code> - How AGI should be invoked on the channel.<br></p> </li> <li> <p><code>args</code> - Arguments to pass to the AGI script or server.<br></p> <ul> <li> <p><code>arg1</code> <strong>required</strong></p> </li> <li> <p><code>arg2[,arg2...]</code></p> </li> </ul> </li> </ul>
         */
        argsList.each((i, el) => {
            const argName = doc$(el).find('code').first().text().trim();
            const argDescription = doc$(el).next('p').text().replace(argName, '').trim();
            const argRequired = argDescription.includes('required');
            const subArgs = [];

            // בדיקת אם יש ul בתוך הארגומנט
            const subArgsList = doc$(el).find('ul').find('li');
            subArgsList.each((j, subEl) => {
                const subArgName = doc$(subEl).find('code').first().text().trim();
                const subArgDescription = doc$(subEl).text().replace(subArgName, '').trim();
                const subArgRequired = subArgDescription.includes('required');
                const subArg = {
                    name: subArgName,
                    description: subArgDescription,
                    required: subArgRequired,
                };
                subArgs.push(subArg);
            });

            if (subArgs.length > 0) {
                const arg = {
                    name: argName,
                    description: argDescription,
                    required: argRequired,
                    subArguments: subArgs,
                };
                args.push(arg);
            } else {
                const arg = {
                    name: argName,
                    description: argDescription,
                    required: argRequired,
                };
                args.push(arg);
            }
        });

        return {
            synopsis,
            description,
            syntax,
            arguments: args,
            link: docURL,
        };
    } catch (error) {
        console.error('Error fetching documentation for AGI', error);
    }
}

async function main() {
    const agiURL =
        'https://docs.asterisk.org/Asterisk_16_Documentation/API_Documentation/Dialplan_Applications/AGI/';
    const documentation = await getDocumentation(agiURL);

    fs.writeFileSync(
        './functions/functions-16.json',
        JSON.stringify({ AGI: documentation }, null, 2)
    );

    console.log('Documentation written to functions-16.json');
}

main();
