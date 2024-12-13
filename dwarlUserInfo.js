export default class UserInfo {
  constructor(email, phone, hasPassword, passkeys, preferredContactMethod) {
    this.email = email
    this.phone = phone
    this.hasPassword = hasPassword
    this.passkeys = passkeys
    this.preferredContactMethod = preferredContactMethod
  }

  hasEmail() {
    return this.email.length > 0
  }

  hasPhone() {
    return this.phone.length > 0
  }

  hasPasskey() {
    return this.passkeys.length > 0
  }


}
