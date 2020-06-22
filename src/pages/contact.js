import React from "react"
import { graphql, useStaticQuery } from "gatsby"

import Layout from "../components/layout"
import SEO from "../components/seo"
const Contact = props => {
  const data = useStaticQuery(graphql`
    query ContactQuery {
      site {
        siteMetadata {
          title
          author {
            name
            summary
          }
          social {
            twitter
          }
        }
      }
    }
  `)
  const siteTitle = data.site.siteMetadata.title

  return (
    <Layout location="contact" title={siteTitle}>
      <SEO title={"Contact"} description="Contact Pete" />

      <div>
        <h2>Contact</h2>
        <p>Contact: me@&lt;thisdomain&gt;</p>
        <form
          method="post"
          netlify-honeypot="bot-field"
          data-netlify="true"
          name="contact"
        >
          <input type="hidden" name="bot-field" />
          <input type="hidden" name="form-name" value="contact" />
          <label>
            <span>Name</span>
            <input type="text" name="name" id="name" />
          </label>
          <label>
            <span>Email</span>
            <input type="email" name="email" id="email" />
          </label>
          <label>
            <span>Subject</span>
            <input type="text" name="subject" id="subject" />
          </label>
          <label>
            <span>Message</span>
            <textarea name="message" id="message" rows="5" />
          </label>
          <input type="submit" value="Send" />
        </form>
      </div>
    </Layout>
  )
}

export default Contact
