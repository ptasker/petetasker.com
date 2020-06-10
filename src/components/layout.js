import React from "react"
import { Link, useStaticQuery, graphql } from "gatsby"

import "../styles/main.scss"
import GB from "../../content/assets/ghostbusters.mp4"
import twitter from "../../content/assets/twitter.svg"
import rss from "../../content/assets/rss.svg"

import VideoOverlay from "./video-overlay"

//https://www.gatsbyjs.org/tutorial/part-four/

const Layout = ({ location, title, children, isHome }) => {
  // const rootPath = `${__PATH_PREFIX__}/`
  let header

  const data = useStaticQuery(
    graphql`
      query {
        site {
          siteMetadata {
            siteUrl
            title
            social {
              twitter
            }
          }
        }
      }
    `
  )

  const site = data.site.siteMetadata

  const twitterUrl = site.social.twitter
    ? `https://twitter.com/${site.social.twitter.replace(/^@/, ``)}`
    : null

  return (
    <>
      <div className={"wrapper"}>
        <header
          className="site-head"
          style={{
            ...(site.cover_image && {
              backgroundImage: `url(${site.cover_image})`,
            }),
          }}
        >
          <div className="site-mast container">
            <div className="site-mast-left">
              <h1 className="site-banner-title">
                <Link to="/">{site.title}</Link>
              </h1>
            </div>
            <div className="site-mast-right">
              {site.social.twitter && (
                <a
                  href={twitterUrl}
                  className="site-nav-item"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img className="site-nav-icon" src={twitter} alt="Twitter" />
                </a>
              )}

              <a
                className="site-nav-item"
                href={`https://feedly.com/i/subscription/feed/${site.siteUrl}/rss/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img className="site-nav-icon" src={rss} alt="RSS Feed" />
              </a>
            </div>
          </div>
          {isHome ? (
            <div className="site-banner">
              <div className="video-wrap">
                <video
                  className={"video-bg"}
                  no-controls="true"
                  muted
                  autoPlay
                  loop
                >
                  <source src={GB} type="video/mp4"></source>
                  <track></track>
                </video>
              </div>
              <div className="video-overlay">
                <VideoOverlay />
              </div>
              <p className="site-banner-desc">{site.description}</p>
            </div>
          ) : null}
          <div className="container">
            <nav className="site-nav">
              <div className="site-nav-right">
                <Link className="site-nav-button" to="/about">
                  <span className="label">About</span>
                </Link>
                <Link className="site-nav-button" to="/contact">
                  <span className="label">Contact</span>
                </Link>
                <Link className="site-nav-button" to="/uses">
                  <span className="label">Uses</span>
                </Link>
              </div>
            </nav>
          </div>
        </header>

        <div className="bg-white-wrap">
          <main className="container">{children}</main>
        </div>
        <footer>
          <div className="container">
            <hr />
            <p>
              <span className="muted">
                <a href="https://thenounproject.com/search/?q=ecto-1&i=1367798">
                  Ecto-1
                </a>{" "}
                icon by Patengerie from the{" "}
                <a href="http://thenounproject.com/">Noun Project</a>
              </span>
              © {new Date().getFullYear()}, Built with
              {` `}
              <a href="https://www.gatsbyjs.org">Gatsby</a>
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}

export default Layout
