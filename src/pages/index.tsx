// Gatsby supports TypeScript natively!
import React from "react"
import ReactHtmlParser from "react-html-parser"
import { PageProps, Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import SEO from "../components/seo"
import Img from "gatsby-image"

type Data = {
  site: {
    siteMetadata: {
      title: string
    }
  }
  allMarkdownRemark: {
    edges: {
      node: {
        excerpt: string
        frontmatter: {
          title: string
          date: string
          description: string
          featuredImage: {
            childImageSharp: any
          }
        }
        fields: {
          slug: string
        }
      }
    }[]
  }
}

const BlogIndex = ({ data, location }: PageProps<Data>) => {
  const siteTitle = data.site.siteMetadata.title
  const posts = data.allMarkdownRemark.edges

  return (
    <Layout location={location} title={siteTitle} isHome={true}>
      <SEO title="Home" />
      <div className="post-list">
        {posts.map(({ node }) => {
          let { featuredImage } = node.frontmatter
          let featuredImgFluid = data.defaultImg.childImageSharp.fluid;

          if (
            featuredImage &&
            featuredImage.hasOwnProperty("childImageSharp")
          ) {
            featuredImgFluid = featuredImage.childImageSharp.fluid
          }

          const title = node.frontmatter.title || node.fields.slug

          return (
            <article key={node.fields.slug}>
              {featuredImgFluid && (
                 <Link to={node.fields.slug}><Img fluid={featuredImgFluid} className="featured-image" /></Link>
              )}
              <header>
                <h3>
                  <Link to={node.fields.slug}>{ReactHtmlParser(title)}</Link>
                </h3>
                <small>{node.frontmatter.date}</small>
              </header>
              <section className="post-excerpt">
                <p
                  dangerouslySetInnerHTML={{
                    __html: node.frontmatter.description || node.excerpt,
                  }}
                />
              </section>
            </article>
          )
        })}
      </div>
    </Layout>
  )
}

export default BlogIndex

export const pageQuery = graphql`
  query {
    defaultImg: file(absolutePath: { regex: "/gb-thumb.jpg/" }) {
      childImageSharp {
        fluid(maxWidth: 400, quality: 80, webpQuality: 90) {
          ...GatsbyImageSharpFluid
        }
      }
    }
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(
      sort: { fields: [frontmatter___date], order: DESC }
      filter: { frontmatter: { type: { eq: "post" } } }
    ) {
      edges {
        node {
          excerpt
          fields {
            slug
          }
          frontmatter {
            date(formatString: "MMMM DD, YYYY")
            title
            featuredImage {
              childImageSharp {
                fluid(maxWidth: 400) {
                  ...GatsbyImageSharpFluid
                }
              }
            }
          }
        }
      }
    }
  }
`
