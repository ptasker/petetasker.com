import React from "react"
import Image from "gatsby-image"
import { graphql } from 'gatsby'
import Typewriter from "typewriter-effect"
import { useStaticQuery } from "gatsby"
import "../styles/intro.scss"
import ectoOne from "../../content/assets/ecto-1.svg"

const HomeBio = props => {
  const titles = ["Programmer", "Dad", "General Handyman"]
  const data = useStaticQuery(graphql`
    query HomeBioQuery {
      avatar: file(absolutePath: { regex: "/profile-pic.png/" }) {
        childImageSharp {
          fixed(width: 300, height: 300) {
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
  return (
    <div className="home-bio">
      {/* <img className="site-nav-icon" src={ectoOne} alt="Ecto-1" /> */}
      <div className="container">
        <div className="bio-wrap">
          <div>
            <div className="avatar">
              <Image
                fixed={data.avatar.childImageSharp.fixed}
                alt={data.site.siteMetadata.author.name}
                imgStyle={{
                  borderRadius: `50%`,
                }}
              />
            </div>
          </div>
          <div>
            {" "}
            <h3 className="source-code">{"<developer>"}</h3>
            <p>[insert 🧀y bio] front-end experiences and backend logic</p>
            {/* <Typewriter
        options={{
          strings: titles,
          autoStart: true,
          loop: true,
        }} */}
            <h3 className="source-code">{"</developer>"}</h3>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomeBio
