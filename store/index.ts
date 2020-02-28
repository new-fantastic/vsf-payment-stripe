export default {
  namespaced: true,

  state: {
    clientSecret: null
  },

  mutations: {
    setClientSecret (state, value) {
      state.clientSecret = value
    }
  }
}