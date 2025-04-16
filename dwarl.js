import axios from 'axios'
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import UserInfo from './dwarlUserInfo.js'

export default class Dwarl {
  baseUrl = ''
  sessionId = null
  jwtToken = ''
  jwtTokenExpires = null
  lastResponse = null

  constructor({ baseUrl }) {
    this.baseUrl = baseUrl
  }

  getSessionId() {
    return this.sessionId
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId
  }

  getJwtToken() {
    return this.jwtToken
  }

  getJwtTokenExpires() {
    return this.jwtTokenExpires
  }

  setJwtToken(token) {
    console.log('setJwtToken')
    this.jwtToken = token
  }

  setJwtTokenExpires(expires) {
    this.jwtTokenExpires = expires
  }

  async maybeRefreshJwtToken() {
    console.log('maybeRefreshJwtToken')
    if (this.jwtToken === null) {
      console.log('Do not refresh - no jwt token')
      throw Error('Access denied')
    }
    const now = Math.floor(Date.now() / 1000)
    if (now > this.jwtTokenExpires) {
      console.log('Do not refresh - token is expired')
      throw Error('Access denied')
    }
    const remaining = this.jwtTokenExpires - now
    const minutesRemainingLimit = 59
    const secondsRemainingLimit = minutesRemainingLimit * 60
    console.log(remaining, 'remaining')
    if (remaining < secondsRemainingLimit) {
      await this.refreshJwtToken()
    }
  }

  async refreshJwtToken() {
    console.log('refreshJwtToken')
    const path = '/jwt/token'
    const data = await this.request(
      path,
      {},
      this.jwtToken,
      null
    )
    this.setJwtToken(data.token)
    this.resetJwtTokenExpiry()
  }

  resetJwtTokenExpiry() {
    console.log('resetJwtTokenExpiry')
    this.jwtTokenExpires = Math.floor(Date.now() / 1000) + 3600
  }

  async registerEmail(email) {
    if (typeof email !== 'string') {
      throw new Error('Email must be string')
    }
    if (email.length === 0) {
      throw new Error('Email is required')
    }
    if (email.length < 3) {
      throw new Error('Email too short')
    }
    if (email.includes('@') === false) {
      throw new Error('Email must contain @')
    }

    const path = '/dwarl/registration/set-email'
    await this.request(path, { email })

    this.sessionId = this.lastResponse.headers['session-id']
    console.log(this.sessionId, 'session_id')

    return true
  }

  async registerPhone(phone, country) {
    const path = '/dwarl/registration/set-phone'
    await this.request(path, { phone, country })

    this.sessionId = this.lastResponse.headers['session-id']
    console.log(this.sessionId, 'session_id')

    return true
  }

  async verifyContactMethod(otp) {
    const path = '/dwarl/registration/verify-contact-method'
    const data = await this.request(
      path,
      { otp },
      null,
      this.sessionId
    )
    console.log(data.status)
  }

  async createPasskey(urlPrefix) {
    // called during registration.
    const optionsJson = await this.registerDeviceOptions(urlPrefix)
    console.log(optionsJson, 'optionsJson')
    const attestation = await this.generateAttestation(optionsJson)
    await this.registerDevice(attestation, urlPrefix)
  }

  async addPasskey() {
    // called from manage passkey page.
    const rdoPath = '/dwarl/authenticated/register-device-options'
    const data = await this.request(rdoPath, null,this.jwtToken)
    const optionsJson = data.data

    if (!optionsJson) {
      throw new Error('Missing options json')
    }

    console.log(optionsJson, 'optionsJson')

    // supportedAlgorithmIDs [-7, -257]

    const attestation = await this.generateAttestation(optionsJson)
    const rdPath = '/dwarl/authenticated/register-device'
    await this.request(rdPath, { attestation }, this.jwtToken)
  }

  async registerDeviceOptions(urlPrefix) {
    const path = '/dwarl/' + urlPrefix + '/register-device-options'
    const response = await this.request(
      path,
      null,
      null,
      this.sessionId
    )
    return response.data
  }

  async generateAttestation(optionsString) {
    let attResp
    try {
      const optionsJSON = JSON.parse(optionsString)
      attResp = await startRegistration({ optionsJSON })
    } catch (error) {
      console.log(error, 'generate attestation error')
    }
    if (!attResp) {
      throw new Error('startRegistration failed')
    }
    console.log(attResp, 'attResp')
    const attestation = JSON.stringify(attResp)
    if (!attestation) {
      throw new Error('Failed to json encode startRegistration response.')
    }
    console.log(attestation, 'attestation')
    return attestation
  }

  async registerDevice(attestation, urlPrefix) {
    const path = '/dwarl/' + urlPrefix + '/register-device'
    const data = await this.request(
      path,
      { attestation },
      null,
      this.sessionId
    )
    if (typeof data.token !== 'string') {
      console.error('token missing from register device response')
    }
    this.setJwtToken(data.token)
    this.resetJwtTokenExpiry()
    return data.data
  }

  async userInfo() {
    console.log('userInfo')
    const path = '/dwarl/user-info'
    const data = await this.request(
      path,
      null,
      this.jwtToken
    )
    console.log(data, 'userInfo')

    return new UserInfo(data.email, data.phone, data.hasPassword, data.passkeys, data.preferredContactMethod)
  }

  async loginWithPasskey(user_handle) {
    const optionsJSON = await this.requestOptions(user_handle)
    console.log(optionsJSON, 'optionsJSON')
    // console.log(this.lastResponse, 'lastResponse')

    const session_id = this.lastResponse.headers['session-id']
    console.log(session_id, 'session_id')

    let authentication_request = await startAuthentication({ optionsJSON })
    console.log(authentication_request, 'authentication_request')
    authentication_request = JSON.stringify(authentication_request)
    console.log(authentication_request, 'authentication_request stringified')

    const auth_response = await this.authenticateRequest(user_handle, authentication_request, session_id)
    console.log(auth_response, 'auth_response')
  }

  async deletePasskey(id) {
    const path = '/dwarl/passkey/delete/' + id
    await this.request(path, {}, this.jwtToken)
  }

  async setPasswordWithPasskey(password, current_password) {
    console.log('setPasswordWithPasskey', { password, current_password })
    const optionsJSON = await this.requestSetPasswordOptions(current_password)
    console.log(optionsJSON, 'options_json')

    let authentication_request = await startAuthentication({ optionsJSON })
    authentication_request = JSON.stringify(authentication_request)

    const path = '/dwarl/set-password-request'
    const params = { authentication_request, password }
    await this.request(path, params, this.jwtToken)
  }

  async setPassword(password, urlPrefix) {
    const path = '/dwarl/' + urlPrefix + '/set-password'
    const data = await this.request(path, { password }, null, this.sessionId)
    this.setJwtToken(data.token)
    this.resetJwtTokenExpiry()
  }

  async requestSetPasswordOtp(method) {
    if (['email', 'phone'].includes(method) === false) {
      throw new Error('Bad method')
    }
    const path = '/dwarl/request-set-password-otp'
    await this.request(path, { method }, this.jwtToken)
    this.sessionId = this.lastResponse.headers['session-id']
  }

  async requestChangePasswordOtp(method, password) {
    const path = '/dwarl/request-change-password-otp'
    await this.request(path, { method, password }, this.jwtToken)
    this.sessionId = this.lastResponse.headers['session-id']
  }

  async registerPasswordWithOtp(password, otp) {
    const path = '/dwarl/registration/set-password'
    const data = await this.request(path, { password, otp }, null, this.sessionId)
    this.setJwtToken(data.token)
    this.resetJwtTokenExpiry()
  }

  async setPasswordWithOtp(password, otp) {
    const path = '/dwarl/set-password-otp'
    await this.request(path, { password, otp }, this.jwtToken)
  }

  async forgotPassword(user_handle) {
    const path = '/dwarl/forgot-password'
    await this.request(path, { user_handle })
    this.sessionId = this.lastResponse.headers['session-id']
  }

  async forgotPasswordSetPassword(password, otp) {
    const path = '/dwarl/forgot-password-set-password'
    const data = await this.request(
      path, { password, otp }, null, this.sessionId
    )

    console.log(data, 'data first response')

    if (Object.keys(data).includes('token')) {
      console.log('Got token - login')
      this.setJwtToken(data.token)
      this.resetJwtTokenExpiry()
      return
    }

    if (data.requestOptions) {
      const optionsJSON = data.requestOptions
      let authentication_request = await startAuthentication({ optionsJSON })
      authentication_request = JSON.stringify(authentication_request)

      const path = '/dwarl/forgot-password-set-password-confirm'
      const params = { authentication_request, password }
      const response = await this.request(path, params, null, this.sessionId)

      console.log(response, 'second response')

      this.setJwtToken(response.token)
      this.resetJwtTokenExpiry()
      return
    }

    throw new Error('Unexpected response')

  }

  async lostPasskey(user_handle) {
    const path = '/dwarl/lost-passkey'
    await this.request(path, { user_handle })
    this.sessionId = this.lastResponse.headers['session-id']
  }

  async lostPasskeySubmitOtp(otp) {
    const path = '/dwarl/lost-passkey/submit-otp'
    const response = await this.request(path, { otp }, null, this.sessionId)
    if (response.token) {
      this.setJwtToken(response.token)
      this.resetJwtTokenExpiry()
    }
    console.log(response, 'response')
    return response.status
  }

  async lostPasskeySubmitPassword(password) {
    const path = '/dwarl/lost-passkey/submit-password'
    const response = await this.request(path, { password }, null, this.sessionId)
    console.log(response, 'lostPasskeySubmitPassword response')
    this.setJwtToken(response.token)
    this.resetJwtTokenExpiry()
  }

  async loginWithPassword(user_handle, password) {
    const path = '/dwarl/authenticate-password'
    const data = await this.request(path, { user_handle, password })
    const session_id = this.lastResponse.headers['session-id']

    if (typeof data.requestOptions === 'object') {
      const optionsJSON = data.requestOptions
      let authentication_request = await startAuthentication({ optionsJSON })
      authentication_request = JSON.stringify(authentication_request)
      await this.authenticateRequest(user_handle, authentication_request, session_id)
    }
    else if (typeof data.token === 'string') {
      this.setJwtToken(data.token)
      this.resetJwtTokenExpiry()
    }
  }

  logout() {
    this.jwtToken = null
  }

  async requestOptions(user_handle) {
    const path = '/dwarl/request-options'
    const data = await this.request(path, { user_handle }, null)
    return data.data
  }

  async requestSetPasswordOptions(current_password) {
    const path = '/dwarl/request-set-password-options'
    const data = await this.request(
      path,
      { current_password },
      this.jwtToken
    )
    return data.data
  }

  async authenticateRequest(user_handle, authentication_request, session_id) {
    const path = '/dwarl/authenticate-request'
    const data = await this.request(
      path,
      { user_handle, authentication_request },
      null,
      session_id
    )
    this.setJwtToken(data.token)
    this.resetJwtTokenExpiry()
    return data.data
  }

  async setEmailRequest(email) {
    this.userHandle = email
    if (email.includes('@') === false || email.length < 3) {
      throw new Error('Invalid email')
    }
    const data = await this.request('/dwarl/set-contact-method', {}, this.jwtToken)

    if (data.requestOptions) {
      const optionsJSON = data.requestOptions
      let authentication_request = await startAuthentication({ optionsJSON })
      authentication_request = JSON.stringify(authentication_request)
      const path = '/dwarl/set-contact-method-request-otp'
      await this.request(path, { authentication_request, user_handle: email }, this.jwtToken)
      return true
    }

    if (data.passwordRequired) {
      return 'provide password'
    }

    return false
  }

  async setPhoneRequest(phone) {
    this.userHandle = phone
    if (phone.length < 6) {
      throw new Error('Invalid phone')
    }
    const data = await this.request('/dwarl/set-contact-method', {}, this.jwtToken)

    if (data.requestOptions) {
      const optionsJSON = data.requestOptions
      let authentication_request = await startAuthentication({ optionsJSON })
      authentication_request = JSON.stringify(authentication_request)
      const path = '/dwarl/set-contact-method-request-otp'
      await this.request(path, { authentication_request, user_handle: phone }, this.jwtToken)
      return true
    }

    if (data.passwordRequired) {
      return 'provide password'
    }

    return false
  }


  async setPreferredContactMethod(method) {
    await this.request('/dwarl/set-preferred-contact-method', { method }, this.jwtToken)
  }

  async setContactMethodProvidePassword(password) {
    const requestOtpPath = '/dwarl/set-contact-method-request-otp'
    await this.request(requestOtpPath, {
      password,
      user_handle: this.userHandle,
    }, this.jwtToken)
  }

  async setContactMethodConfirm(otp) {
    const path = '/dwarl/set-contact-method-confirm'
    await this.request(path, { otp }, this.jwtToken)
  }

  /**
   * Make API request.
   *
   * @param path
   * @param params
   * @param token
   * @param sessionId
   * @returns {Promise<any|boolean>}
   */
  async request(path, params, token = null, sessionId = null) {
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

    if (sessionId) {
      options.headers['session-id'] = sessionId
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
      const message = error.response.data?.error
      if (message) {
        throw new Error(message)
      }

      const status = error.response.status
      if (status === 403) {
        throw new Error('Access denied')
      }

      throw error
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