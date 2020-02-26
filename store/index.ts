export default {
  namespaced: true,

  state: {
    isProcessing: false
  },

  mutations: {
    setProcessing (state, value) {
      state.isProcessing = value
    }
  }
}
