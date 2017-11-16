import path from 'path';
import find from 'find';
const fs = require('fs');

const mjpage = require('mathjax-node-page/lib/main.js').mjpage;
var lunr = require('lunr');

import debug from 'debug';
const genDebug = debug("mbe:gen");

export function getRoutes(rootDir, sponsors) {
    return async (data) => {
        let dev = data.dev;
        let jsonDir = path.join(rootDir, "..", "text", "build", "json");
        genDebug("jsonDir = %s", jsonDir);
        let results = await new Promise((resolve) => {
            find.file(/\.fjson$/, jsonDir, (files) => {
                resolve(files);
            });
        });
        let pages = results.filter((f) => f.length > jsonDir.length).map((f) => f.slice(jsonDir.length));
        genDebug("# of pages = %j", pages.length);

        let map = {};
        let titles = {};
        for (let i = 0; i < pages.length; i++) {
            let page = pages[i];
            let href = page.slice(0, page.length - 6) + "/";
            let file = path.join(".", "json", page);
            try {
                let obj = JSON.parse(fs.readFileSync(file).toString());
                if (obj.body && !dev) {
                    obj.body = await new Promise((resolve) => {
                        genDebug("Rendering math for %s", page);
                        mjpage(obj.body, { format: ["TeX"] }, { svg: true }, (output) => resolve(output));
                        genDebug("...done");
                    });
                }
                map[page] = obj;
                titles[href] = obj.title;
            } catch (e) {
                console.error("Error processing page " + page);
                console.error(e);
            }
        }

        let root = {
            path: '/',
            component: 'src/containers/Root',
            getProps: () => ({ page: map["/index.fjson"], sponsors: sponsors }),
        };
        let normal = pages.filter((page) => page !== "index.fjson").map((page) => {
            return {
                path: page.slice(0, page.length - 6) + "/",
                component: 'src/containers/Page',
                getProps: () => ({ data: map[page], titles: titles }),
            }
        });

        if (!dev) {
            genDebug("Building index");
            let index = lunr(function () {
                this.field("id");
                this.field("title");
                this.field("body");

                genDebug("  Pages to index: %o", normal);
                normal.forEach((page) => {
                    let obj = page.getProps().data;
                    genDebug("    Indexing %s", obj.title);
                    if (obj.title && obj.body) {
                        let doc = {
                            id: page.path,
                            body: obj.body,
                            title: obj.title,
                        };
                        this.add(doc);
                    } else {
                        genDebug("      Missing title or body: %o", obj);
                    }
                })
            });

            genDebug("Search for 'equation' yielded %s hits", index.search("equation").length);

            // We need to write to 'dist' because 'public' has already been copied.
            fs.writeFile(path.join("dist", "lunr.json"), JSON.stringify(index.toJSON()), (err) => {
                if (err) console.error(err);
            });
        }

        genDebug("# of normal pages: %j", normal.length);
        let error = {
            is404: true,
            component: 'src/containers/404',
        };
        return [root, ...normal, error];
    }
}