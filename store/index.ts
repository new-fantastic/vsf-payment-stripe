export default {
  namespaced: true,

  state: {
    clientSecret: null,
    stripeError: null,
    threeDsFailed: false
  },

  mutations: {
    setClientSecret (state, value) {
      state.clientSecret = value
    },
    setStripeError (state, value) {
      state.stripeError = value
    },
    setThreeDsFailed (state, value) {
      state.threeDsFailed = value
    }
  }
}