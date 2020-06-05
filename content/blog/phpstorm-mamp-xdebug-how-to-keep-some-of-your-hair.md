---
title: 'PHPStorm, MAMP and Xdebug - How to keep (some of) your hair'
date: '2017-10-16T13:57:14-04:00'
status: publish
permalink: /phpstorm-mamp-xdebug-how-to-keep-some-of-your-hair
author: Pete
excerpt: ''
type: post
id: 466
category:
    - Code
    - MAMP
    - PHP
    - WordPress
    - xdebug
tag: []
post_format: []
medium_post:
    - 'O:11:"Medium_Post":11:{s:16:"author_image_url";s:75:"https://cdn-images-1.medium.com/fit/c/400/400/1*4uTvLtID9ViJpji0DXd6sg.jpeg";s:10:"author_url";s:30:"https://medium.com/@petetasker";s:11:"byline_name";N;s:12:"byline_email";N;s:10:"cross_link";s:2:"no";s:2:"id";s:12:"faae7c25f118";s:21:"follower_notification";s:3:"yes";s:7:"license";s:19:"all-rights-reserved";s:14:"publication_id";s:2:"-1";s:6:"status";s:6:"public";s:3:"url";s:98:"https://medium.com/@petetasker/phpstorm-mamp-and-xdebug-how-to-keep-some-of-your-hair-faae7c25f118";}'
text_box_1:
    - ''
another_box:
    - ''
test:
    - "<?php\r\n\r\necho \"What's up y'all?\"\r\n  \r\n <script>\r\n \r\n  function foo(){\r\n\r\n\talert(\"yep\");\r\n}\r\n  \r\n </script>\r\n\r\n"
code_field:
    - "\r\n<h3>Who is this?</h3>\r\n\r\n<script>\r\n  \r\n  function goo(){\r\n   \talert(\"wat?\");\r\n    \r\n  }\r\n  \r\n</script>\r\n\r\n"
groups_0_code:
    - "<?php\r\n\r\n\r\necho \"Who dis?\";\r\n\r\nfunction(){\r\n  \r\n}\r\n"
groups_0_codez2:
    - '<h4>What''s up?</h4>'
groups:
    - 'a:1:{i:0;s:3:"wat";}'
---
> I’m mostly logging this here for my own benefit, but if the Google gods brought your here, sweet!

Just came across another fun quirk with running Xdebug, MAMP and PHPStorm together. ????

I’ve talked about this combination causing me [issues in the past](https://petetasker.com/mamp-xdebug-phpstorm-and-symlink-madness/), but this is a whole new situation that killed a couple hours for me.

So, it appears that for PHPStorm to pick up Xdebug correctly, the `xdebug.remote_host` variable needs to be set correctly. It normally is, if you copy-pasta some of the tutorials on the internet.

Unfortunately, for some reason, this Monday morning, setting this value to `localhost` no longer worked. Why? Welp, localhost is pointing to an invalid folder location, according to MAMP. Apparently this was enough for PHPStorm to freak out and just not run Xdebug. Period.

Fun!

So how’d I figure out this was the reason for Xdebug throwing up?

The PHPStorm docs of course! Wayyyyy at the bottom of [this page](https://confluence.jetbrains.com/display/PhpStorm/Validating+Your+Debugging+Configuration#ValidatingYourDebuggingConfiguration-Remotehostisconfiguredas'localhost'despiteserverhostisprobablynotlocal) it’s plainly stated:

> ### Remote host is configured as ‘localhost’ despite server host is probably not local
> 
>  The URL to validation script contains something different from localhost, but the xdebug.remote\_host value is not set and so is using the default value of localhost, or is set to localhost or 127.0.0.1.

[\#themoyouknow](https://www.youtube.com/watch?v=pU96c_3RXXU)

![](https://i1.wp.com/media.giphy.com/media/d2YVk2ZRuQuqvVlu/giphy.gif?w=525&ssl=1)