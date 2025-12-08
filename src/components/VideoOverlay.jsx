import "../styles/intro.scss";
import React from 'react';
import Typewriter from "typewriter-effect";

const VideoOverlay = () => {
  return (
    <div className="intro">
      <em className="hey">Hey I'm</em>
      <span className="mah-name">Pete Tasker</span>
      <b>
        <Typewriter
          options={{
            strings: ["Programmer", "Dad", "General Handyman", "Pizza Maker", "Beer Drinker"],
            autoStart: true,
            loop: true,
          }}
        />
      </b>
    </div>
  );
};

export default VideoOverlay;
