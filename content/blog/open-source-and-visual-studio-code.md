---
title: 'Open Source, PHP and Visual Studio Code'
date: '2017-11-22T21:12:06-04:00'
status: publish
permalink: /open-source-and-visual-studio-code
author: Pete
excerpt: ''
type: post
id: 506
thumbnail: ../uploads/2017/11/49ihnx9qqbx6chh225d8.png
category:
    - Code
    - PHP
    - xdebug
tag: []

---
Lately, [VS Code](https://code.visualstudio.com/) has been getting a lot of hype in the dev community. It’s been around since for a few years and TBH is a really sweet editor. Lots of great extensions and community support. It’s also quite fast (for an Electron app ?) and the peeps and Microsoft seem to be keeping it up to date and iterating quickly.

However, anything you *really need* to work with PHP is missing by default. I believe this is by design to encourage a vibrant extensions community. Luckily, like most languages, there’s a vibrant open source PHP extension community. There’s a few great extensions for PHP: [PHP IntelliSense](https://marketplace.visualstudio.com/items?itemName=felixfbecker.php-intellisense), [PHP Debug](https://marketplace.visualstudio.com/items?itemName=felixfbecker.php-debug) (both by the [same developer](https://github.com/felixfbecker)) as well as [PHP Intelliphense](https://marketplace.visualstudio.com/items?itemName=bmewburn.vscode-intelephense-client) (#wat?). There’s even a really great intro by [Jeffrey Way on Laracasts](https://laracasts.com/series/visual-studio-code-for-php-developers) outlining everything you need to do to get VS Code set up for PHP dev.

Some of the PHP packages work fine and have over a million installs (!!!). Sometimes, however, they *don’t* work. Like, at all. Just today, the PHP Debug extension completely broke. Luckily the developer was paying attention and rolled out a fix within hours. Pretty awesome support for an open-source product!

However, if you paid for the editor, say something like PHPStorm, you could go and raise an issue on their support channel. You could complain about the product not working, rightly so, as you’ve paid for the right! As a ‘customer’ you have a certain amount of clout with a vendor like Jetbrains. This is *NOT* the case with open source, and I feel that we developers forget this.

This is where I take issue. I’m all for open source software. I’ve built my career on it. The issue is that the developer for this plugin had to fix the issue himself. There’s an expectation there that he *HAS* to fix the issue, and do it RIGHT NOW. And if it’s not done immediately people freak out, complain on Twitter, write a blog post about, have a cow ?, man.

Open source is just that, open. If you find an issue with a plugin, editor, extension or WHATEVER, see if you can fix it! That’s the whole point. Let’s not throw our hands up and complain, let’s get our hands dirty and fix the damn thing.

That’s what open source is all about. Let’s remember that.

/rant