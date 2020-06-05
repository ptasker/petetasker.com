---
title: 'NodeJS Christmas trees and Promises'
date: '2015-05-07T15:34:55-04:00'
status: publish
permalink: /nodejs-christmas-trees-and-promises
author: Pete
excerpt: ''
type: post
id: 225
category:
    - Code
    - NodeJS
tag: []
post_format: []
---
Lately, I’ve been getting more into NodeJS development and playing with various aspects of it. It’s a refreshing change from a mostly PHP oriented job and is uniquely challenging but familiar because of Javascript.

One of the early struggles I had with the framework was the concept of async code and callbacks. If you follow most of the tutorials and docs, you’re encouraged to write anonymous function based callbacks.

<style>.gist table { margin-bottom: 0; }</style><div class="gist-oembed" data-gist="482629947dcfe2005acb.json" data-ts="8"></div>While this works for a simple application, when you start to scale, things get ugly – i.e. the Christmas Tree of hell:

<style>.gist table { margin-bottom: 0; }</style><div class="gist-oembed" data-gist="4677e93462caef51f0f0.json" data-ts="8"></div>Obviously, this way isn’t readable or maintainable. There’s also the issue of errors needed to be handled at *each* level of nesting. Not good and repetitive.

One of the oft-talked about solutions is Promises. Promises *promised* to be an easy solution. The concept of promises in async programming is talked about all over the internet, and I had a hard time understanding it at first. I eventually got the hang of it and tried to convert some code to use the [Q module](https://www.npmjs.com/package/q):

<style>.gist table { margin-bottom: 0; }</style><div class="gist-oembed" data-gist="6f1412a04813f1123157.json" data-ts="8"></div>Great, looks good, relatively clean and it includes exception handling by default. Christmas tree is gone!

I did run into a few issues/shortcomings for me, that bothered me a bit.

First, most NPM modules don’t use promises internally, like mongoosejs. This is a problem since this now requires me the developer to inject promises into the callbacks (that’s what the Q.defer() is all about). While not a big deal, it’s a bit of an annoyance to start converting all my callbacks to use this syntax.

Additionally, I wasn’t able to successfully pass multiple arguments to successively linked functions. The docs for the Q module say you can nest promises to get multiple inputs in your closure, oh yay!

<style>.gist table { margin-bottom: 0; }</style><div class="gist-oembed" data-gist="9a5f736a3a3a24ed3719.json" data-ts="8"></div>I see a Christmas tree appearing…

So after trying out promises, I came to a solution that worked in my situation. I stumbled across this blog post on NodeJS structure, [Callback hell is a design choice](http://blog.caplin.com/2013/03/13/callback-hell-is-a-design-choice/). And suddenly, a lightbulb appeared.

You see, you don’t need to use anonymous functions as callbacks, you can pass in pre-defined functions. And with the handy-dandy [bind() method available in ES5](http://stackoverflow.com/questions/7874723/maintaining-the-reference-to-this-in-javascript-when-using-callbacks-and-closu), you’re able to pass contextual variables to nest callbacks. Awesome.

Here’s what I finally came up with:

<style>.gist table { margin-bottom: 0; }</style><div class="gist-oembed" data-gist="835e91c7f8f22eee6883.json" data-ts="8"></div>So you see, in the first method kickOffTwitterCall() I’m assigned things I want available to nest functions to ‘this’ reference. As long as each callback uses the .bind(this) I’ve got access to anything assigned to ‘this’.

There’s also the added benefit of being able to pass extra args to bind which will then be available in the callback:

<style>.gist table { margin-bottom: 0; }</style><div class="gist-oembed" data-gist="9846d0e1d5c19142b6e9.json" data-ts="8"></div>I have no doubt promises have their place, and I intend to use them when possible, however in some situations, they’re just not the right fit. For me it was about code organization and readability, and bind() was able to accomplish what I needed. +1 for learning new things!