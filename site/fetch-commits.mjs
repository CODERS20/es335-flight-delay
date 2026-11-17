/* Save the most recent commits by a contributor to public/data/commits.json,
 * so the Reproduce screen has them even when the GitHub API is unreachable.
 * The page also asks GitHub live and prefers the fresher answer.
 *
 *   node fetch-commits.mjs            (defaults to divyasaini-dot)
 *   node fetch-commits.mjs <login>
 */
import { writeFile } from "node:fs/promises";

const REPO = "coders20/es335-flight-delay";
const author = process.argv[2] ?? "divyasaini-dot";
const res = await fetch(`https://api.github.com/repos/${REPO}/commits?author=${author}&per_page=8`, {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "es335-flight-delay-site" },
});
if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
const commits = (await res.json()).map((c) => ({
  sha: c.sha.slice(0, 7),
  url: c.html_url,
  date: c.commit.author.date,
  message: c.commit.message.split("\n")[0],
  name: c.commit.author.name,
}));
await writeFile(
  new URL("./public/data/commits.json", import.meta.url),
  JSON.stringify({ author, repo: REPO, saved_at: new Date().toISOString(), commits }, null, 2) + "\n",
);
console.log(`saved ${commits.length} commits by ${author}`);
