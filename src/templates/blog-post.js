import React from "react"
import { Link, graphql, useStaticQuery } from "gatsby"
import ReactHtmlParser from "react-html-parser"
import { Disqus, CommentCount } from "gatsby-plugin-disqus"

import Bio from "../components/bio"
import Layout from "../components/layout"
import SEO from "../components/seo"
import Img from "gatsby-image"

const BlogPostTemplate = ({ data, pageContext, location }) => {
  const post = data.markdownRemark
  const siteTitle = data.site.siteMetadata.title
  const { frontmatter } = post
  const { previous, next } = pageContext

  let { featuredImage } = post.frontmatter
  let featuredImgFluid = undefined

  if (featuredImage && featuredImage.hasOwnProperty("childImageSharp")) {
    featuredImgFluid = featuredImage.childImageSharp.fluid
  }
  // let featuredImgFluid = post.frontmatter.featuredImage.childImageSharp.fluid
  let disqusConfig = {
    url: `${data.site.siteMetadata.siteUrl + location.pathname}`,
    identifier: post.id,
    title: post.frontmatter.title,
  }
  return (
    <Layout location={location} title={siteTitle}>
      <SEO
        title={post.frontmatter.title}
        description={post.frontmatter.description || post.excerpt}
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
          {frontmatter.type === "post" && <p>{frontmatter.date}</p>}
        </header>
        <section dangerouslySetInnerHTML={{ __html: post.html }} />
        <Disqus config={disqusConfig} />
        {frontmatter.type === "post" && (
          <nav className="post-nav">
            <ul>
              {previous.frontmatter.type !== "page" && (
                <li>
                  {previous && (
                    <Link to={previous.fields.slug} rel="prev">
                      ← {ReactHtmlParser(previous.frontmatter.title)}
                    </Link>
                  )}
                </li>
              )}
              {next.frontmatter.type !== "page" && (
                <li>
                  {next && (
                    <Link to={next.fields.slug} rel="next">
                      {ReactHtmlParser(next.frontmatter.title)} →
                    </Link>
                  )}
                </li>
              )}
            </ul>
          </nav>
        )}
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
      html
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
        type
        featuredImage {
          childImageSharp {
            fluid(maxWidth: 800) {
              ...GatsbyImageSharpFluid
            }
          }
        }
      }
    }
  }
`
