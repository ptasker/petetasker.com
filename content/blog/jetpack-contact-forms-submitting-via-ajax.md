---
title: 'WordPress Jetpack contact forms'
date: '2016-05-05T18:13:08-04:00'
status: publish
permalink: /jetpack-contact-forms-submitting-via-ajax
author: Pete
excerpt: ''
type: post
id: 261
category:
    - Code
    - Javascript
    - WordPress
tag:
    - Javascript
post_format: []
_yoast_wpseo_primary_category:
    - '2'
code_field:
    - "This is my code\r\n\r\n<span>It is great</span>"
flex_0_test:
    - test
flex_1_test:
    - 'test again.'
flex:
    - 'a:2:{i:0;s:4:"test";i:1;s:4:"test";}'
---
### **EDIT, May 9, 2016**

**I noticed that the form wouldn’t submit when not logged in, so I’ve updated the gist to include a check to see if a user is logged in.**

- - - - - -

Jetpack is awesome for a lot of things. Unfortunately, one of the things that it isn’t so great for is submitting it’s contact form via AJAX. I’ve looked into this before and decided I might as well hack something together that ‘kind of works’ ™.

Here’s the full working code, I’ll go into a bit below:

<style>.gist table { margin-bottom: 0; }</style><div class="gist-oembed" data-gist="7606fac1f75cfa99dc7d25dc178479f4.json" data-ts="8"></div>Basically, all you do is fake-send the form via ajax, parse the returned page’s HTML and look for an H3 tag with the submission message.

Easy-peasy…