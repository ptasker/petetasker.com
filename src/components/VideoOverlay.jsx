import React from 'react';
import Typewriter from "typewriter-effect";

const VideoOverlay = () => {
  return (
    <div className="flex flex-col items-center justify-center text-center w-full px-4 md:w-auto">
      <em className="block text-2xl md:text-3xl text-green-400 mb-2 font-mono" style={{ textShadow: '1px 1px 2px black' }}>
        Hey I'm
      </em>
      <span className="block text-5xl md:text-7xl lg:text-8xl font-bold uppercase text-slate-50 mb-4 tracking-tighter" style={{ textShadow: '2px 2px 4px black' }}>
        Pete Tasker
      </span>
      <div className="text-2xl md:text-4xl lg:text-5xl uppercase font-mono text-yellow-400 h-16" style={{ textShadow: '1px 1px 2px black' }}>
        <Typewriter
          options={{
            strings: ["Programmer", "Dad", "General Handyman", "Pizza Maker", "Ghostbuster"],
            autoStart: true,
            loop: true,
            wrapperClassName: "inline-block",
            cursorClassName: "animate-pulse text-yellow-400"
          }}
        />
      </div>
    </div>
  );
};

export default VideoOverlay;
