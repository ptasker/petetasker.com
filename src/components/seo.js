/**
 * SEO component that queries for data with
 *  Gatsby's useStaticQuery React hook
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react"
import PropTypes from "prop-types"
import { Helmet } from "react-helmet"
import { useStaticQuery, graphql } from "gatsby"

const SEO = ({ description, lang, meta, title, thumbnail, pathname }) => {
  const { site } = useStaticQuery(
    graphql`
      query {
        site {
          siteMetadata {
            title
            description
            siteUrl
            social {
              twitter
            }
          }
        }
      }
    `
  )

  const metaDescription = description || site.siteMetadata.description
  let thumbnailFluid = undefined
  const canonical = pathname ? `${site.siteMetadata.siteUrl}${pathname}` : null

  if (thumbnail && thumbnail.hasOwnProperty("childImageSharp")) {
    thumbnailFluid = thumbnail.childImageSharp.fluid
  }

  const imageSrc = thumbnailFluid && thumbnail.childImageSharp.fluid.src

  const image =
    imageSrc
    ? `${site.siteMetadata.siteUrl}${imageSrc}`
    : null

  return (
    <Helmet
      htmlAttributes={{
        lang,
      }}
      title={title}
      titleTemplate={`%s | ${site.siteMetadata.title}`}
      link={
        canonical
        ? [
            {
              rel: "canonical",
              href: canonical,
            },
          ]
        : []
      }
      meta={[
        {
          name: `description`,
          content: metaDescription,
        },
        {
          property: `og:title`,
          content: title,
        },
        {
          property: `og:description`,
          content: metaDescription,
        },
        {
          property: `og:type`,
          content: `website`,
        },
        {
          name: `twitter:card`,
          content: `summary_large_image`,
        },
        {
          name: `twitter:creator`,
          content: site.siteMetadata.social.twitter,
        },
        {
          name: `twitter:title`,
          content: title,
        },
        {
          name: `twitter:description`,
          content: metaDescription,
        },

      ].concat(
        image
        ? [
            {
              property: "og:image",
              content: image,
            },
            {
              property: "og:image:width",
              content: 1200,
            },
            {
              property: "og:image:height",
              content: 620,
            },
            {
              name: `twitter:image:width`,
              content: 1200,
            },
            {
              name: `twitter:image:height`,
              content: 620,
            },

            {
              name: "twitter:card",
              content: "summary_large_image",
            },
          ]
        : [
            {
              name: "twitter:card",
              content: "summary",
            },
          ]
      ).concat(meta)}
    />
  )
}

SEO.defaultProps = {
  lang: `en`,
  meta: [],
  description: ``,
}

SEO.propTypes = {
  description: PropTypes.string,
  lang: PropTypes.string,
  meta: PropTypes.arrayOf(PropTypes.object),
  title: PropTypes.string.isRequired,
}

export default SEO
