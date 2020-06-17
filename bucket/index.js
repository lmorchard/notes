#!/usr/bin/env node
const path = require("path");
const url = require("url");
const globby = require("globby");
const mkdirp = require("mkdirp");
const util = require("util");
const fsOrig = require("fs");
const fs = {
  readFile: util.promisify(fsOrig.readFile),
  writeFile: util.promisify(fsOrig.writeFile),
};
const escapeHtml = require("escape-html");
const marked = require("marked");
const OpmlParser = require("opmlparser");

const config = {
  postsDir: path.join(__dirname, "."),
  buildDir: path.join(__dirname, "..", "output", "static", "bucket"),
  baseUrl: "/bucket/",
  siteTitle: "notes.lmorchard.com/bucket",
};

const README = `
These are daybook-style notes that I tried to keep over the course of 2006 through 2009.

Some of them are from a defunct OPML blog using [Dave Winer's OPML Editor](http://home.opml.org/).

Others are in Markdown format from what I used to call a brain bucket instead of a blog.

Nothing earth-shattering here, but I wanted to get them into HTML so at least I could read them again.
`;

async function main() {
  const notes = [];
  const files = globby.stream(`${config.postsDir}/**/*.{opml,txt}`);
  let prevNote = null;
  for await (const file of files) {
    const [year, month, day] = file
      .replace(`${config.postsDir}/`, "")
      .split(/[\/.]/g);
    const ext = path.extname(file);
    const filename = path.resolve(config.postsDir, file);
    const note = {
      notePath: `${year}/${month}/${day}`,
      filename,
      year,
      month,
      day,
      ext,
      prevNote,
    };
    if (prevNote) {
      prevNote.nextNote = note;
    }
    prevNote = note;
    notes.push(note);
  }

  notes.sort((a, b) => a.notePath.localeCompare(b.notePath));

  for (const note of notes) {
    note.rendered = await renderNote(note);
  }

  for (const note of notes) {
    const { notePath, rendered } = note;
    if (!rendered) {
      continue;
    }
    const filePath = path.join(config.buildDir, notePath);
    await mkdirp(filePath);
    await fs.writeFile(
      path.join(filePath, "index.html"),
      indexNote(note)(),
      "utf-8"
    );
  }

  await fs.writeFile(
    path.join(config.buildDir, "index.html"),
    indexRoot({ notes })(),
    "utf-8"
  );
}

async function renderNote(note) {
  const { filename, ext } = note;
  switch (ext) {
    case ".txt": {
      const data = await fs.readFile(filename, "utf8");
      return marked(data);
    }
    case ".opml": {
      return opmlRender(note);
    }
  }
}

async function opmlRender(note) {
  return new Promise((resolve, reject) => {
    const { filename } = note;

    const instream = fsOrig.createReadStream(filename, "utf-8");
    instream.on("error", reject);

    const parser = new OpmlParser();
    parser.on("error", reject);

    let meta = {};
    let items = {};
    let children = {};

    parser.once("readable", function () {
      meta = this.meta;
    });

    parser.on("readable", function () {
      let item;
      while ((item = this.read())) {
        items[item["#id"]] = item;
        children[item["#parentid"]] = [
          ...(children[item["#parentid"]] || []),
          item["#id"],
        ];
      }
    });

    const outlineList = (id) =>
      children[id] &&
      html`
        <ul data-parent-id="${id}">
          ${children[id]
            .map((childId) => items[childId])
            .map(
              ({ "#id": childId, text, created }) => html`
                <li id="${childId}" data-created="${created}">
                  <p>${unescaped(text)}</p>
                  ${outlineList(childId)}
                </li>
              `
            )}
        </ul>
      `;

    parser.on("end", function () {
      const { title, datecreated, datemodified } = meta;
      resolve(
        html`
          <article
            class="outline"
            data-title="${title}"
            data-created="${datecreated}"
            data-modified="${datemodified}"
          >
            ${outlineList(0)}
          </article>
        `()
      );
    });

    instream.pipe(parser);
  });
}

const html = (strings, ...values) => () =>
  strings
    .reduce((result, string, i) => result + string + htmlValue(values[i]), "")
    .trim();

const htmlValue = (value) => {
  if (!value) {
    return "";
  } else if (typeof value === "function") {
    return value();
  } else if (Array.isArray(value)) {
    return value.map(htmlValue).join("");
  } else if (typeof value === "object") {
    return htmlValue(JSON.stringify(value, null, "  "));
  }
  return escapeHtml(value);
};

const unescaped = (raw) => () => raw;

const urlencode = (raw) => () => escapeHtml(encodeURIComponent(raw));

const page = ({ title, content }) => html`
<!DOCTYPE html>
<html lang="en-us">
	<head>
		<title>${title} - ${config.siteTitle}</title>
		<meta property="og:site_name" content="${config.siteTitle}" />
		<meta property="og:type" content="article" />
		<meta http-equiv="content-type" content="text/html; charset=utf-8" />

		<link rel="stylesheet" href="https://blog.lmorchard.com/css/screen.css" type="text/css" media="screen, projection" />
		<link rel="stylesheet" href="https://blog.lmorchard.com/css/vendor/font-awesome.css" type="text/css" media="screen, projection" />
		<link rel="stylesheet" href="https://blog.lmorchard.com/css/vendor/prism.css" type="text/css" media="screen, projection" />

    <style type="text/css">
      .main .content section.post-content >ul {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: left;
        margin: 1em 0;
        padding: 0;
      }
      .main .content .post-content >ul li {
        flex-basis: 15%;
        margin: 0.25em 0;
        padding: 0;
        list-style-type: none;
        flex-grow: 1;
      }
    </style>
	</head>
	<body>
		<section class="main">
			<header>
				<h1><a href="${config.baseUrl}">${config.siteTitle}</a></h1>
				<h2>thinking with the lid off</h2>
				<nav>
					<label for="nav-trigger"></label>
					<input type="checkbox" id="nav-trigger" class="nav-trigger" />
					<ul>
						<li><a href="http://lmorchard.com/">about me</a></li>
						<li><a href="/RecentChanges.html">recent changes</a></li>
					</ul>
				</nav>
			</header>
			<section class="content">
				<article class="post wiki">
          <h1 class="title">${title}</h1>
					<section class="post-content">
            ${content}
					</section>
			<footer>
				<img id="growup" src="https://blog.lmorchard.com/uploads/growup.jpg" />
			</footer>
		</section>
	</body>
</html>
`;

const noteLink = ({ notePath, text, title, year, month, day }) => html`
  <a
    href="${config.baseUrl}${notePath}"
    title="${title ? title : html`${year} / ${month} / ${day}`}"
    >${text ? text : html`${year} / ${month} / ${day}`}</a
  >
`;

const indexRoot = ({ notes }) =>
  page({
    title: "Bucket notes",
    content: html`
      ${unescaped(marked(README))}
      <ul>
        ${notes.map((note) => html`<li>${noteLink(note)}</li>`)}
      </ul>
    `,
  });

const indexNote = ({ year, month, day, prevNote, nextNote, rendered }) =>
  page({
    title: `${year} / ${month} / ${day}`,
    content: html`
      <nav class="post-links">
        ${prevNote &&
        html` ${noteLink({ ...prevNote, text: unescaped("&laquo; prev") })} `}
        |
        ${nextNote &&
        html` ${noteLink({ ...nextNote, text: unescaped("next &raquo;") })} `}
      </nav>
      ${unescaped(rendered)}
    `,
  });

main().catch((err) => console.error(err));
