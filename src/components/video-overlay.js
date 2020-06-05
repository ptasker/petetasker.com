import React, { useEffect, useState } from "react"
import Typewriter from "typewriter-effect"
import "../styles/intro.scss"

const VideoOverlay = props => {
  const titles = ["Programmer", "Dad", "General Handyman"]

  return (
    <div className="intro">
      <em className="hey">Hey I'm</em>
      <span className="mah-name">Pete Tasker</span>
      <b>
        Programmer / Dad / General Handyman
        {/* <Typewriter
          options={{
            strings: titles,
            autoStart: true,
            loop: true,
          }}
        /> */}
      </b>
    </div>
  )
}

export default VideoOverlay
