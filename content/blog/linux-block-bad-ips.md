---
title: 'Blocking bad IPs'
date: '2015-08-20T19:12:04-04:00'
status: publish
permalink: /linux-block-bad-ips
author: Pete
excerpt: ''
type: post
id: 234
category:
    - Code
    - Deployment
    - Linux
    - Security
tag: []
post_format: []
---
This is more an informational post for myself, but here’s some nifty commands that help debug what’s going wrong on a server when things aren’t going right.

```
netstat -t
```

```
netstat -tn
```

These are good for watching WHO is hitting your server and what their IP is. netstat -tn shows the unresolved address, so you should get the IP’s of possible spammers

Once you’ve got the IP(s) you can block them with iptables like so:

```
<pre class="bash">iptables -I INPUT -s <IP ADDRESS> -j DROP
```

Another good tool for watching network traffic is iftop. You’ll need to install this one via Yum or Apt though:

```
 iftop -N -i eth0
```

[![1__ssh](https://i2.wp.com/petetasker.com/wp-content/uploads/2015/08/1__ssh1.png?resize=525%2C435&ssl=1)](https://i2.wp.com/petetasker.com/wp-content/uploads/2015/08/1__ssh1.png?ssl=1)

And for overall machine health, nothing beats good old htop! Ahh, CPU usage back to normal.

[![1__ssh](https://i2.wp.com/petetasker.com/wp-content/uploads/2015/08/1__ssh.png?resize=525%2C412&ssl=1)](https://i2.wp.com/petetasker.com/wp-content/uploads/2015/08/1__ssh.png?ssl=1)