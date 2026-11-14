# Notes for Claude

## Merging
- Never merge into `main` without asking first. Open a pull request, share the link, and wait for an explicit go-ahead before merging.

## Project
- The game lives in `cat-pet/`. Edit the sources in `cat-pet/src/`, then run `python3 cat-pet/build.py` to regenerate `cat-pet/index.html` (a single self-contained file that must also work when opened on its own). Commit both.
- The site is served by GitHub Pages from `main`; the root `index.html` redirects to `cat-pet/`.
