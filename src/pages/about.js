import React from "react"
import { graphql, useStaticQuery } from "gatsby"

import Layout from "../components/layout"
import SEO from "../components/seo"
import Image from "gatsby-image"

const About = props => {
  const data = useStaticQuery(graphql`
    query AboutQuery {
      avatar: file(absolutePath: { regex: "/profile-pic.png/" }) {
        childImageSharp {
          fixed(width: 250, height: 250) {
            ...GatsbyImageSharpFixed
          }
        }
      }
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
      <SEO title={"About"} description="About Pete" />
      <h2>About</h2>
      <div className="about-row">
        <div className="avatar">
          <Image
            fixed={data.avatar.childImageSharp.fixed}
            alt={data.site.siteMetadata.author.name}
            imgStyle={{
              borderRadius: `50%`,
            }}
          />
        </div>
        <div>
          <p>
            Hey I'm Pete{" "}
            <span role="img" aria-label="Hi">
              👋
            </span>
            . I'm a software developer located in Ottawa Canada. I'm also a dad,
            general handyman around the house, and a generally curious guy.
          </p>
          <p>
            I currently work at{" "}
            <a href="https://github.com/ptasker?" target="blank">
               GitHub
            </a>{" "}
            as a Senior Software Developer.
          </p>
        </div>
      </div>
    </Layout>
  )
}

export default About
