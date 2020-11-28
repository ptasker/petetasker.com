import React, { useState } from "react"
import addToMailchimp from "gatsby-plugin-mailchimp"
import "./subscribe-form.scss"
//https://www.stackbit.com/blog/jamstack-gatsby-mailchimp/#finished-component
const SubscribeForm = props => {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const handleSubmit = async e => {
    e.preventDefault()
    const result = await addToMailchimp(email)
    setMessage(result.msg)
  }
  function handleInputChange(e) {
    setEmail(e.target.value)
  }

  return (
    <form
      name="subscribeForm"
      method="POST"
      id="subscribe-form"
      className="subscribe-form"
      onSubmit={handleSubmit}
    >
      <p className="hey">Hey, sometimes I post new content, so if you want to stay up to date sign up for my newsletter. Promise I won't spam you 🤞</p>
      <div className="message" dangerouslySetInnerHTML={{ __html: message }} />

      <div className="form-row">
        <label>
          {/*<span className="screen-reader-text">Email address</span>*/}
          <input
            className="subscribe-email"
            type="email"
            name="email"
            placeholder="Enter Email Address..."
            value={email}
            onChange={handleInputChange}
          />
        </label>
      </div>
      <button className="button" type="submit">
        Subscribe
      </button>
    </form>
  )
}

export default SubscribeForm
