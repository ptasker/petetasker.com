---
title: "Using async await with jQuery's $.ajax"
date: '2017-12-14T13:26:01-04:00'
status: publish
permalink: /using-async-await-jquerys-ajax
author: Pete
excerpt: ''
type: post
id: 536
# thumbnail: ../assets/2017/12/async-await.jpg
featuredImage: ../blog-post-images/async-await.jpg
category:
    - Code
    - Javascript
    - jQuery
tag: []
---
<small>Photo by [Denys Nevozhai](https://unsplash.com/photos/2vmT5_FeMck?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText) on [Unsplash](https://unsplash.com/?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText)</small>

> If you’re like me, you’re probably stuck using jQuery more often than not. It’s everywhere, and to be honest it’s a solid, mature library. It’s also often already loaded on the page, especially if you’re working with WordPress.
 
If you’re like me, you’re probably stuck using jQuery more often than not. It’s everywhere, and to be honest it’s a solid, mature library. It’s also often already loaded on the page, especially if you’re working with WordPress.

Outside of DOM manipulations (which you can now do *mostly* with native JS), jQuery’s `$.ajax()` method is really handy and works well.

But did you know that this function provides Promise interface out of the box? I recently remembered this and I thought to myself:

> Hmm I wonder if I can use async/await with jQuery’s $.ajax().

Turns out, you can!

The setup
---------

Async/await is really new still, it’s only in the [ES2017 spec](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function), so you’ll need to use a [transpiler](https://scotch.io/tutorials/javascript-transpilers-what-they-are-why-we-need-them) like [Babel](https://babeljs.io/) to get it working in older browsers. Most of us are using Babel anyway with our bundlers ([Webpack](https://babeljs.io/docs/setup/#installation), Browserify), so this isn’t a huge deal.

Assuming you already have Babel installed and configured, the first thing you’ll need to do is get Babel to use the ‘env’ preset. In your .babelrc file, add these lines:

```javascript
{
...
"presets": ["babel-preset-env"],
...
}

```

You’ll also have to install this Babel preset and polyfill from npm: `npm i -D babel-preset-env babel-polyfill`.

Once that’s done you’ll also need to install this [magic plugin](https://babeljs.io/docs/plugins/transform-async-to-generator/) for Babel: `npm i -D babel-plugin-transform-async-to-generator`. This is the key package that lets you use async/await in your code. I should mention that this simply gets Babel to compile the async/await syntax to ES2015 generators, so if you’re not targeting most modern browsers keep that in mind.

The next, and *FINAL* thing you need to do is use the `babel-polyfill` module in your code. You can use a Webpack loader if you like, or just include the package in your source files:

```javascript
import 'babel-polyfill';

```

Phew!

Ok, now we’re ready to go. Start up Webpack and let’s start using async/await!

Don’t call me, maybe
--------------------

Back in the day you had to use $.ajax() like this:

```javascript

//Function wrapper that confuses alot of devs because async code works differently
function doAjax() {
    $.ajax({
        url: ajaxurl,
        type: 'POST',
        data: {
            stuff: "here"
        },
        success: function (data) {
            //wacky nested anonymous callbacks go here
            var something_but_not_really = data;
        },
        error: function (jqXHR, textStatus, errorThrown) {
            // Empty most of the time...
        }
    });

    return something_but_not_really
}


```

I know when I was a junior dev I had no idea why `something_but_not_really` was `undefined`. I had to learn about callbacks a billion times ?.

But now…

```javascript
async function doAjax(args) {


    const result = await $.ajax({
        url: ajaxurl,
        type: 'POST',
        data: args
    });

    return result;
}

```

And result *actually* returns the AJAX result. Cool right?

The big benefit of async/await is that it makes asynchronous code *appear* synchronous. As in, do this thing, wait for it to finish and then give me the result.

Errors
------

Notice anything missing in our new function? Yep, error handling is non-existent. Fortunately, since async/await is essentially synchronous, you can use `try...catch()`!!!

```javascript
async function doAjax(args) {
    let result;

    try {
        result = await $.ajax({
            url: ajaxurl,
            type: 'POST',
            data: args
        });

        return result;
    } catch (error) {
        console.error(error);
    }
}

```

And there you have it. Some error catching built in. Now, there’s other ways to handle errors with async/await, but they’re a [little more complex](http://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/).

The other thing to keep in mind now, since we’re returning the result of an awaited function, `result` will equal a [Promise instance](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise). You have 2 options with what you can do with the result.

The first option is to make sure that you use await when calling `doAjax()` later on.

```javascript
// Elsewhere in code, inside an async function
const stuff = await doAjax();

```

The other option is to use the `Promise` interface and roll that way:

```javascript
doAjax().then( (data) => doStuff(data) )

```

Promises aren’t all that bad, and can look cleaner or be easier to work with, depending. I’ve found that using ES2015 classes it’s sometimes easier to use the Promise interface, so YMMV.

But that’s it – go get your `$.ajax()` using async/await today!