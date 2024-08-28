import axios from 'axios'
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export default class warl {
  baseUrl = ''
  verifyContactToken = ''
  setAuthToken = ''
  accessToken = ''
  lastResponse = null

  constructor({ baseUrl }) {
    this.baseUrl = baseUrl
    console.log(this.baseUrl, 'this.baseUrl 1')
  }

  async registerEmail(email) {
    const path = '/dwarl/register/email'
    const data = await this.request(path, { email })
    if (typeof data.token === 'undefined') {
      console.error('token missing from register email response')
      return false
    }
    this.verifyContactToken = data.token
    return true
  }

  async verifyEmail(email, otp) {
    const path = '/dwarl/verify'
    const data = await this.request(
      path,
      { otp },
      this.verifyContactToken
    )
    if (typeof data.token === 'undefined') {
      console.error('token missing from verify response')
      return false
    }
    this.setAuthToken = data.token
    return true
  }

  async createPasskey() {
    const optionsJson = await this.registerDeviceOptions()
    console.log(optionsJson, 'optionsJson')
    const attestation = await this.generateAttestation(optionsJson)
    console.log(attestation, 'attestation')
    if (attestation) {
      await this.registerDevice(attestation)
    }
  }

  async registerDeviceOptions() {
    const path = '/dwarl/register-device-options'
    const data = await this.request(
      path,
      null,
      this.setAuthToken
    )
    return data.data
  }

  async generateAttestation(optionsJson) {
    let attResp
    try {
      attResp = await startRegistration(optionsJson)
    } catch (error) {
      console.log(error, 'generate attestation error')
    }
    return JSON.stringify(attResp)
  }

  async registerDevice(attestation) {
    const path = '/dwarl/register-device'
    const data = await this.request(
      path,
      { attestation },
      this.setAuthToken
    )
    if (typeof data.token !== 'string') {
      console.error('token missing from register device response')
    }
    this.accessToken = data.token
    return data.data
  }

  async listPasskeys() {
    const path = '/dwarl/passkey/list'
    const data = await this.request(
      path,
      null,
      this.accessToken
    )
    console.log(data, 'data')
    return data
  }

  async login(user_handle) {
    const options_json = await this.requestOptions(user_handle)
    console.log(options_json, 'options_json')
    console.log(this.lastResponse, 'lastResponse')

    // const authentication_request = JSON.stringify(await startAuthentication(options_json))
    // console.log(authentication_request, 'authentication_request')
    // const auth_response = await this.authenticateRequest(user_handle, authentication_request)
    // console.log(auth_response, 'auth_response')
  }

  async requestOptions(user_handle) {
    const path = '/dwarl/request-options'
    const data = await this.request(path, { user_handle }, null)
    return data.data
  }

  async authenticateRequest(user_handle, authentication_request) {
    const path = '/dwarl/authenticate-request'
    const data = await this.request(path, { user_handle, authentication_request }, null)
    return data.data
  }

  /**
   * Make API request.
   *
   * @param path
   * @param params
   * @param token
   * @returns {Promise<any|boolean>}
   */
  async request(path, params, token) {
    const url = this.baseUrl + path

    const options = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    }

    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token
      options.headers['Access-Control-Allow-Headers'] = 'Authorization'
    }

    console.log({ url, params, options }, 'request')

    let data = null
    if (params) {
      data = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        data.append(key, value)
      }
    }

    let response
    try {
      response = await axios.post(url, data, options)
    } catch (error) {
      console.error(error)
      return false
    }

    if (typeof response.data === 'undefined') {
      console.error('data missing from response')
      return false
    }

    console.log(response, 'response')

    this.lastResponse = response

    return response.data
  }

}