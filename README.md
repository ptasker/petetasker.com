petetasker.com Astro site

Each level starts with a ghost wave and ends with a randomly selected boss encounter, including Garaka. Defeat the boss to advance to the next level. Boss selection is independent each level, so repeats are possible; pausing or retrying an escaped boss keeps the same selection.

## Boss Testing

Run `npm run dev`, open `/#ghost-patrol`, and focus the game canvas. The development-only shortcuts start a fresh encounter:

- `1`: Stay Puft
- `2`: Terror Dog
- `3`: The Scoleri Brothers (both together)
- `4`: Slime Serpent
- `5`: Garaka

Press the same key to restart a fight, or another key to switch bosses. Each shortcut starts the selected boss at level 1 difficulty. Boss test runs do not save personal bests or leaderboard entries. After a test run ends, Play again starts a normal game. Shortcuts are disabled in production builds.

Run `npm test` for the boss encounter and frame-by-frame trap alignment checks at narrow and wide stage widths, with normal and reduced motion.
