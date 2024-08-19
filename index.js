import axios from 'axios'
import NoteyApiError from '../../src/lib/error/NoteyApiError'

export default class dwarl {
  baseUrl = ''

  constructor({ baseUrl }) {
    this.baseUrl = baseUrl
  }

  async registerEmail(email) {
    const url = this.baseUrl + '/dwarl/register/email'

    const options = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    }

    const data = new URLSearchParams()
    data.set('email', email)

    let response
    try {
      response = await axios.post(url, data, options)
    } catch (error) {
      console.error(error)
    }

    console.log(response, 'response')

    return response.data;
  }

}