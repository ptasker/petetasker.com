---
title: "Using async await with jQuery's $.ajax"
date: '2020-06-12T13:26:01-04:00'
status: publish
permalink: /using-async-await-jquerys-ajax
author: Pete
excerpt: ''
type: post
imagequote: 'Photo by Denys Nevozhai on Unsplash'
imagelink: 'https://unsplash.com/photos/2vmT5_FeMck?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText'
# thumbnail: ../assets/2017/12/async-await.jpg
featuredImage: ../blog-post-images/async-await.jpg
category:
    - Code
    - Javascript
    - jQuery
tag: []
---

If you’re like me, you’re probably stuck using jQuery more often than not. It’s everywhere, and to be honest it’s a solid, mature library. It’s also often already loaded on the page, especially if you’re working with WordPress.

Outside of DOM manipulations (which you can now do *mostly* with native JS), jQuery’s `$.ajax()` method is really handy and works well.

But did you know that this function provides [Promise interface](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) out of the box? I recently remembered this and I thought to myself:

> Since async/await is just Promise's under the hood, I wonder if I can use async/await with jQuery’s $.ajax().

Turns out, you can!

How to use async/await with jQuery
---------

Async/await is a _fairly_ new feature. It was added in the [ES2017 spec](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) 4 years ago or so and is now available natively in most modern, evergreen browsers. There's no reason to not use it in your current JavaScript code.

If you'd like to support older browsers (or old IE), you'll need to use a [transpiler](https://stackoverflow.com/a/47506839/130596) like [Babel](https://babeljs.io/) to get it working in older browsers. Most of us are using Babel anyway with our bundlers like [Webpack](https://babeljs.io/docs/setup/#installation)), so this isn’t a huge deal.

## Don’t call me, maybe

Back in the day you had to invoke jQuery's `$.ajax()` function like the following:

```javascript{numberLines: true}

//Function wrapper that confuses alot of devs because async code works differently that synchronous code
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

When I was a junior dev I had no idea why `something_but_not_really` evaluated to `undefined`. I had to re-learn [callbacks](https://developer.mozilla.org/en-US/docs/Glossary/Callback_function) more than a few times. The hardest part for me was understanding the difference between _asynchronous_ code and _synchronous_ code. 

This [Stack Overflow answer](https://stackoverflow.com/a/26804844/130596) summarizes the concept really well:

>SYNCHRONOUS
>
>You are in a queue to get a movie ticket. You cannot get one until everybody in front of you gets one, and the same applies to the people queued behind you.
>
>ASYNCHRONOUS
>
>You are in a restaurant with many other people. You order your food. Other people can also order their food, they don't have to wait for your food to be cooked and served to you before they can order. In the kitchen restaurant workers are continuously cooking, serving, and taking orders. People will get their food served as soon as it is cooked.

If we take the earlier example and update it to use `async/await` syntax: 

```javascript{numberLines: true}

async function doAjax(args) {
    const result = await $.ajax({
        url: ajaxurl,
        type: 'POST',
        data: args
    });

    return result;
}

```

And the `result` variable *actually* returns the AJAX result. Cool right?

The big benefit of async/await is that it makes asynchronous code *appear* synchronous. As in, do this thing, wait for it to finish and then give me the result.

Errors
------

Notice anything missing in our new function? Yep, error handling is non-existent. Fortunately, since async/await is essentially synchronous, you can use `try...catch()`!!!

```javascript{numberLines: true}

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