---
title: "JavaScript's cryptic 'this' - what, when and why"
date: '2017-11-30T16:30:18-04:00'
status: publish
type: post
featuredImage: ../blog-post-images/this.jpg
imagequote: 'Photo by Tarun Ram on Unsplash'
imagelink: 'https://unsplash.com/'
category:
    - Code
    - Javascript
---

Before MDN started to organize their JavaScript documentation, finding answers to your JavaScript questions often landed you on Stack Overflow.

Welp, these days MDN has mostly done away with that practice, that is, except if you’re looking for answers around the usage of JavaScript’s `this` keyword.

The [documentation is great](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this), it really is, but it’s not exactly full of helpful, real-world examples. So I thought I’d put together a few tips and tricks about the ever so magical `this` keyword.

### Old-skool JS

> “Back in my day we had to alert out our objects!”

Ok, so yeah, if you run `console.log(this)` in your dev console you’ll *generally* see that by default, `this = Window{}`. Super helpful…?

It gets more interesting when you check the value of `this` inside a function:

```javascript

function mahFunc(){
    console.log(this);
}

mahFunc();
// Window{}
```

You should still see the Window object. Ok so, nothing new here.

But what if you add `'use strict'`?

```javascript
function mahFunc(){
    'use strict'
    console.log(this);
}
// undefined

```

Hmm.

Ok now, but what if you call `mahFunc()` on the Window global (since it’s a global function)?

```javascript
function mahFunc(){
    'use strict'
    console.log(this);
}

window.mahFunc();
// Window

```

Huh?

Strict mode is a funny beast, but it generally makes errors more obvious and cleans up your JavaScript. Something not mentioned in the MDN docs is that bundlers/loaders/concatenators like Webpack/Browserify, may have strict mode enabled by default. You might end up with some wacky loader that enables it with out you knowing. So keep an eye out if you ever see your `this` call returning something funny.

Call me plz
-----------

Ok so `this` in a global context is weird, but who doesn’t use objects and ES2015 classes these days? If you’d like to use a *different* value for `this`, (as-in not `undefined` or `Window`) inside your function, you can pass a context with [`.call()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call) and [`.apply()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply). I always remember these with ‘yadda-yadda.prototype.call()’.

```javascript
function mahFunc() {
  console.log(this);
}

const config = {
    stepOne(){
        //do step one
    },

    stepTwo(){
        //do step 2
    }
}

mahFunc.call(config);

//{stepOne: ƒ, stepTwo: ƒ}

```

And there you go. `this` references the object passed in argument to `.call()`. Cool right?

This way you’re able to specify a context for a function. It’s super handy and what a lot of frameworks and bundlers use internally – check out your Webpack bundles!

I won’t go over all the possible cases/uses of `this`, there’s quite a few and the [MDN doc](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this) is really good.

It’s important to remember `this` ?.