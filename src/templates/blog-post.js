import React from "react"
import { graphql } from "gatsby"
import ReactHtmlParser from "react-html-parser"
import { Disqus } from "gatsby-plugin-disqus"
import SubscribeForm from "../components/subscribe-form"

import Bio from "../components/bio"
import Layout from "../components/layout"
import SEO from "../components/seo"
import Img from "gatsby-image"

const BlogPostTemplate = ({ data, pageContext, location, ...props }) => {
  const post = data.markdownRemark
  const siteTitle = data.site.siteMetadata.title
  const { frontmatter } = post

  let { featuredImage } = post.frontmatter
  let featuredImgFluid = undefined

  if (featuredImage && featuredImage.hasOwnProperty("childImageSharp")) {
    featuredImgFluid = featuredImage.childImageSharp.fluid
  }

  let disqusConfig = {
    url: `${data.site.siteMetadata.siteUrl + location.pathname}`,
    identifier: post.id,
    title: post.frontmatter.title,
  }

  return (
    <Layout location={location} title={siteTitle}>
      <SEO
        title={post.frontmatter.title}
        description={post.excerpt}
        thumbnail={featuredImage}
        pathname={location.pathname}
      />
      {frontmatter.type === "post" && <Bio />}
      <article>
        {featuredImgFluid && (
          <Img fluid={featuredImgFluid} className="featured-image" />
        )}

        <header>
          <h2
            className={
              !featuredImgFluid && frontmatter.type === "post"
                ? "not-featured"
                : ""
            }
          >
            {ReactHtmlParser(post.frontmatter.title)}
          </h2>

          {frontmatter.type === "post" && (
            <p className="date-row">
              {frontmatter.date}

              {frontmatter.imagequote && (
                <>
                  {" • "}
                  <a href={frontmatter.imagelink ? frontmatter.imagelink : ""}>
                    {frontmatter.imagequote}
                  </a>
                </>
              )}
              {" • "}
              {post.fields.readingTime.text}
            </p>
          )}
        </header>
        <section dangerouslySetInnerHTML={{ __html: post.html }} />
        <SubscribeForm />
        {frontmatter.type === "post" && <Disqus config={disqusConfig} />}
      </article>
    </Layout>
  )
}

export default BlogPostTemplate

export const pageQuery = graphql`
  query BlogPostBySlug($slug: String!) {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
    markdownRemark(fields: { slug: { eq: $slug } }) {
      id
      excerpt(pruneLength: 160)
      fields {
        readingTime {
          text
        }
      }
      html
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
        type
        imagequote
        imagelink
        featuredImage {
          childImageSharp {
            fluid(maxWidth: 1200) {
              ...GatsbyImageSharpFluid
            }
          }
        }
      }
    }
  }
`
