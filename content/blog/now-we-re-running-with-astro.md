---
title: "Now we're running with Astro 💪"
date: '2025-12-11T20:50:18-05:00'
status: publish
permalink: /now-we-re-running-with-astro
author: Pete
excerpt: ''
type: post
category:
    - Code
tag: []
---

## From Gatsby to Astro

After running this site on Gatsby for years, I decided it was time for a change. Gatsby has been great, but it was verrrry out of date, and I wanted something faster and more modern. Enter Astro.

## The Migration Process

I kicked things off using [**Jules**](https://jules.google/) from Google Gemini to handle the initial migration from Gatsby to Astro. Honestly, it went way smoother than I expected. Jules did a great job converting the basic structure, routing, and component patterns. There were a few edge cases I had to clean up manually in VS Code with GitHub Copilot's help, but nothing major.

The key changes included:
- Converting React components to Astro's `.astro` format
- Migrating the GraphQL data layer to Astro's Content Collections
- Updating the routing from Gatsby's filesystem routing to Astro's similar but slightly different approach
- Configuring Tailwind CSS integration
- Setting up RSS feed generation with `@astrojs/rss`

## Adding Some Fun with AI

While I was at it, I wanted to add something special to the homepage. I've always loved Ghostbusters, so I thought, "Why not add an animated Ecto-1 to the footer?"

Here's where things got interesting. I took a reference image of the Ecto-1 and used a combination of **ChatGPT** and **Gemini** to convert it into a clean black and white SVG. The AI tools did a great job tracing and converting it into vector paths.

Then I handed it over to **GitHub Copilot** to generate the CSS animation to make it drive across the screen. I gave it some guidance on what I wanted - the car driving from right to left, with smoke puffing out behind it, and the lights on top flashing. Copilot generated the keyframe animations, though I did need to tweak the positioning and timing to get it just right.

The result? Check out the footer below!

## What I Learned

This whole experience really highlighted how AI tools have evolved:

1. **Jules** handled complex framework migration with minimal human (i.e Me) intervention
2. **ChatGPT and Gemini** converted visual designs into SVG code
3. **GitHub Copilot** generated sophisticated CSS animations from basic descriptions

Sure, I still needed to review, test, and refine everything. But what would have taken days of tedious work was compressed into hours. The AI tools handled the repetitive heavy lifting while I focused on the creative decisions and final polish. As a software dev, this was a major change from how I've built this site in the past, but it was kind of fun to let someone else do the work.

## The Result

The site is now running on Astro v5, builds are lightning fast, and I've got a sweet Ecto-1 animation that makes me smile every time I see it. The migration was a success.

The 🤖's aren't just coming - they're already here.