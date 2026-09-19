# Nomad Dimension

**One person's workspace for making a documentary-style YouTube episode, end to
end.** It exists because that job is really five jobs at once — researcher,
archivist, scriptwriter, sound booth, and producer — and someone running a
channel alone needs them in one place instead of spread across twenty browser
tabs and a folder of notes.

[![CI](https://github.com/nadyapribadi/Nomad_Dimension/actions/workflows/ci.yml/badge.svg)](https://github.com/nadyapribadi/Nomad_Dimension/actions/workflows/ci.yml)

## Why this exists

An episode about, say, a depopulating region of Japan does not start with a
script. It starts with dozens of sources: videos, articles, papers, blog posts.
Burying through them turns up hundreds of small facts — the name of a temple and
when it opens, a train line that no longer runs, a local dish, what a ticket
costs, a sentence worth quoting, a village that should appear on a map.

Those facts then have to be sorted into the parts of a story, written into
narration for two hosts, spoken out loud, and finally compiled into the list of
shots, captions, and titles an editor needs.

Done by hand, that work lives in a notes app, a document, a spreadsheet, a
dozen open tabs, and a folder of audio files. Facts get re-researched because
nobody remembers where they came from. A script drifts away from the research
underneath it. Every step starts by hunting for whatever the last step produced.

Nomad Dimension is the answer to that problem: **research is collected once, as
the smallest useful pieces, and every later step reads from that collection
instead of starting over.** The channel covers history, culture, travel, and
geography, in a two-host documentary format with Kai as host and Mia as
co-host.

## What it does

The app walks one episode through six steps, with the operator making every
creative decision along the way.

| Step            | What the operator is doing                                | What the app handles                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library         | Adding a source — paste a link or the text itself         | Pulls the transcript from a YouTube link, then breaks the source down into typed facts: places, activities, food, transport, quotes, story angles, background research, prices, statistics, and vocabulary |
| Ideas           | Noticing that some collected material suggests an episode | Keeps the idea, the question it answers, and how far along it is                                                                                                                                           |
| Episodes        | Choosing what to make next                                | An episode calendar, and the workspace the episode is built in                                                                                                                                             |
| Episode Builder | Deciding which facts belong in which part of the story    | Assembles the selected material into typed sections and saves the plan                                                                                                                                     |
| Script Builder  | Writing the episode                                       | Drafts the Kai-and-Mia dialogue section by section, against the material that section is built from                                                                                                        |
| Audio           | Hearing the script                                        | Renders each host's lines as speech and plays the finished episode back                                                                                                                                    |
| Handoff         | Getting ready to edit and publish                         | Produces the cut guide, a design brief, a thumbnail brief, and the YouTube metadata                                                                                                                        |

Two things are worth calling out because they are the reason the app exists at
all:

- **Nothing is researched twice.** Facts live in Notion as rows, each row
  referenced back to the source it came from. A fact found in January is still
  there, with its evidence, in July.
- **Spending is visible.** Every AI, speech, and search request costs real
  money and is logged as it happens, and the app asks before starting anything
  expensive.

An optional fact-checking step sits alongside the research: claims can be
checked against live web search, and the verdict is saved next to the claim
without overwriting the original wording.

## How it is built

Three decisions explain almost everything about the code:

**The browser never holds a key.** All the AI providers, the speech engine, the
maps lookup, and the Notion connection sit behind small server-side endpoints.
The page can only reach them after signing in, and no credential is ever sent to
the browser, written into a log, or committed. That is what makes it safe for
one person to run a tool that controls a paid account.

**Notion is the database.** There is no separate backend server to run, back up,
or pay for. Everything the app knows lives in the operator's own Notion
workspace, which means editing a fact by hand — in Notion, on a laptop or a
phone — works exactly as well as editing it in the app.

**There is no build step.** The interface is plain HTML, CSS, and JavaScript.
What is in the repository is what runs in the browser. Anyone can open the page,
read it, and change it without installing a toolchain first.

### Repository layout

```
Nomad_Dimension/
├── index.html              # the page: layout, styles, and startup
├── src/
│   ├── core.js             # shared helpers: text, similarity, sorting
│   ├── notion.js           # the Notion connection and local draft storage
│   ├── library.js          # sources, material, fact review, duplicates, places, ideas
│   ├── stages.js           # transcript, script, audio, handoff, export
│   └── app.js              # navigation, dialogs, settings, tables, run state
├── functions/              # the server-side endpoints and shared adapters
├── scripts/                # release staging, checks, and tests
├── netlify.toml            # hosting, redirect, and header policy
├── SECURITY.md
└── LICENSE
```

### Who this is for

It is a personal production tool, not a product. It is wired to one Notion
workspace, signs in with a single operator password, and has no user accounts.
If you found this repository while looking for something to run your own
channel with, the interesting part is the design — how the research model, the
key boundary, and the cost logging fit together — rather than a one-command
install.

## Running it yourself

You will need Node 22 and a Netlify account. Copy `.env.example` to `.env` and
fill in at least `APP_PASSWORD`, `NOTION_TOKEN`, and the two Notion database
ids; the rest are optional and depend on which providers you use.

| Command          | What it does                                          |
| ---------------- | ----------------------------------------------------- |
| `npm install`    | Installs the tooling and the commit hook.             |
| `npm run dev`    | Runs the app and its endpoints locally.               |
| `npm run check`  | Runs the linter, the formatter check, and every test. |
| `npm run format` | Reformats the code.                                   |

There is no compile or build step, so editing `src/*.js` and reloading the page
is the whole development loop.

### Environment variables

| Variable                                                                                                        | Purpose                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `APP_PASSWORD`                                                                                                  | **Required.** The operator's sign-in, at least 16 characters. Changing it signs out existing sessions. |
| `NOTION_TOKEN`                                                                                                  | **Required.** The Notion connection.                                                                   |
| `NOTION_COLLECTIONS_DATABASE_ID`, `NOTION_PLACEMENTS_DATABASE_ID`                                               | **Required.** The two material stores.                                                                 |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`                                                         | The models used for extraction, writing, and research.                                                 |
| `GOOGLE_TTS_API_KEY`                                                                                            | Turns the script into speech.                                                                          |
| `YOUTUBE_API_KEY`                                                                                               | Reads the source channels being browsed.                                                               |
| `GOOGLE_MAPS_API_KEY`                                                                                           | Optional. Adds the prefecture, coordinates, and address to a place.                                    |
| `TRANSCRIPT_API_KEY`                                                                                            | Optional fallback when a video's captions cannot be read directly.                                     |
| `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY` | Optional extra model providers. Set only the ones you actually route to.                               |

If the model routing cannot be read, the app refuses to run rather than quietly
picking a default model and spending money on it.

## Tests and shipping

`npm run check` is the gate, and it runs in CI on every push and pull request.
There are 351 tests, and the ones written first are the paths where a bug would
quietly destroy work — a save that fails halfway, a retry that writes the same
section twice, a transcript that loses its ending.

Deployment is deliberate rather than automatic. Pushing to `main` publishes
nothing; hosting is paid per production deploy, so releases are batched, staged
as a draft, checked, and then promoted.

## Security

No provider key, Notion token, or password is stored in this repository or sent
to the browser. Every endpoint is POST-only, same-origin, size-limited, and
requires the signed session cookie.

If you find a problem, please report it privately — see
[`SECURITY.md`](SECURITY.md). Please test against your own copy: every
authenticated request against the live site spends the operator's money.

## License

[MIT](LICENSE). Use it, copy it, change it, ship it; keep the copyright notice
and the warranty disclaimer.
