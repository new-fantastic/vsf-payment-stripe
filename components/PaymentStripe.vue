<template>

  <div class="mb15 mt20 vsf-stripe-container">
    <h4 class="mt0">
      <label for="vsf-stripe-card-element">
        Credit or debit card
      </label>
    </h4>
    <div class="bg-cl-secondary px20 py20">
      <form action="" id="payment-form">
        <div class="form-row">

          <div id="vsf-stripe-card-element">
            &nbsp;
            <!-- A Stripe Element will be inserted here. -->
          </div>

          <!-- Used to display Element errors. -->
          <div id="vsf-stripe-card-errors" role="alert">
          </div>
        </div>
      </form>
    </div>
  </div>

</template>

<script>
import { mapState } from 'vuex'
import i18n from '@vue-storefront/i18n'
import config from 'config'
import { adjustMultistoreApiUrl } from '@vue-storefront/core/lib/multistore'

export default {
  name: 'PaymentStripe',
  data () {
    return {
      stripe: {
        instance: null,
        elements: null,
        card: null
      },
      processing: false,
      formatedCardData: null
    }
  },
  computed: {
    ...mapState({
      stripeConfig: state => state.config.stripe
    }),
    checkout () {
      return this.$store.state.checkout
    },
    clientSecret () {
      return this.$store.state.stripe.clientSecret
    },
    serverStripeError () {
      return this.$store.state.stripe.stripeError
    }
  },
  watch: {
    clientSecret (clientSecret) {
      // It could be set to null
      if (clientSecret) {
        this.check3ds()
      }
    },
    serverStripeError (serverStripeError) {
      // It could be set to null
      if (serverStripeError) {
        this.onStripeCardChange({
          error: {
            message: serverStripeError
          }
        })
      }
    }
  },
  beforeMount () {
    this.$bus.$on('order-after-placed', this.onAfterPlaceOrder)
  },
  beforeDestroy () {
    this.$bus.$off('order-after-placed', this.onAfterPlaceOrder)
  },
  mounted () { 
    // Load the stripe.js elements script.
    // As it's callback, Configure stripe to run.
    this.loadStripeDependencies(this.configureStripe)

    // Ready to place order, handle anything we need to, generating, validating stripe requests & tokens ect.
    this.$bus.$on('checkout-before-placeOrder', this.onBeforePlaceOrder)

    // Ready to place order, handle anything we need to, generating, validating stripe requests & tokens ect.
    this.$bus.$on('checkout-payment-method-changed', (paymentMethodCode) => {
      if (paymentMethodCode !== this.stripeConfig.paymentMethodCode) {
        // unregister the extension placeorder handler
        this.$bus.$off('checkout-before-placeOrder', this.onBeforePlaceOrder)
      }
    }) 
  },
  methods: {
    onAfterPlaceOrder () {
      // Stop display loader
      this.$bus.$emit('notification-progress-stop')
    },
    onBeforePlaceOrder () {
      if (this.processing) {
        return
      }
      this.processStripeForm()
    },
    loadStripeDependencies (callback) {
      let stripeJsUrl = 'https://js.stripe.com/v3/'
      let docHead = document.getElementsByTagName('head')[0]
      let docScript = document.createElement('script')
      docScript.type = 'text/javascript'
      docScript.src = stripeJsUrl

      // When script is ready fire our callback.
      docScript.onreadystatechange = callback
      docScript.onload = callback
      docHead.appendChild(docScript)
    },
    configureStripe () {
      if (!this.stripeConfig.hasOwnProperty('apiKey')) {
        return false
      }

      // Create a new Stripe client.
      this.stripe.instance = window.Stripe(this.stripeConfig.apiKey)

      // Create an instance of Elements.
      this.stripe.elements = this.stripe.instance.elements()

      // Create the stripe elements card
      this.createElements()

      // Add the event listeners for stripe.
      this.bindEventListeners()
    },
    createElements () {
      let style = this.stripeConfig.hasOwnProperty('style') ? this.stripeConfig.style : {}

      // Create an instance of the card Element.
      this.stripe.card = this.stripe.elements.create('card', { style: style })

      // Add an instance of the card Element into the `card-element` <div>.
      this.stripe.card.mount('#vsf-stripe-card-element')
    },
    bindEventListeners () {
      // Handle real-time validation errors from the card Element.
      this.stripe.card.addEventListener('change', this.onStripeCardChange)
    },
    onStripeCardChange (event) {
      let displayError = document.getElementById('vsf-stripe-card-errors')
      displayError.textContent = event.error ? event.error.message : ''
      this.$store.commit('stripe/setClientSecret', null)
    },
    beforeDestroy () {
      this.unbindEventListeners()
    },
    unbindEventListeners () {
      this.stripe.card.removeEventListener('change', this.onStripeCardChange)
    },
    async processStripeForm () {
      let self = this

      // Start display loader
      this.$bus.$emit('notification-progress-start', [i18n.t('Placing Order'), '...'].join(''))
      // this.processing = true
      // Create payment method with Stripe
      this.stripe.instance.createPaymentMethod({
        type: 'card',
        card: this.stripe.card,
        billing_details: {
          address: {
            city: this.checkout.paymentDetails.city,
            country: this.checkout.paymentDetails.country,
            line1: this.checkout.paymentDetails.streetAddress,
            line2: this.checkout.paymentDetails.apartmentNumber,
            postal_code: this.checkout.paymentDetails.zipCode
          },
          name: `${this.checkout.paymentDetails.firstName} ${this.checkout.paymentDetails.lastName}`,
          phone: this.checkout.paymentDetails.phoneNumber,
          email: this.checkout.personalDetails.emailAddress
        }
      }).then(async (cardResult) => {
        if (cardResult.error) {
          // Inform the user if there was an error.
          let errorElement = document.getElementById('vsf-stripe-card-errors')

          errorElement.textContent = cardResult.error.message

          // Stop display loader
          this.$bus.$emit('notification-progress-stop')
          // this.processing = false
        } else {
            // No needed 3ds
            this.stripe.instance.createPaymentMethod('card', this.stripe.card).then((result) => {
              if (result.error) {
                // Inform the user if there was an error.
                let errorElement = document.getElementById('vsf-stripe-card-errors')
                errorElement.textContent = result.error.message
                // Stop display loader
                self.$bus.$emit('notification-progress-stop')
                    thiselfs.$store.dispatch('notification/spawnNotification', {
                  type: 'error',
                  message: self.$t('Could not fetch client secret, sorry'),
                  action1: { label: self.$t('OK') }
                })
                // self.processing = false
                return
              } else {
                self.formatedCardData = self.formatTokenPayload(result.paymentMethod)
                self.placeOrderWithPayload(self.formatedCardData)
              }
            })
        }
      })
    },
    placeOrderWithPayload (payload) {
      this.$bus.$emit('checkout-do-placeOrder', payload)
      // If it requires 3ds auth
      // ClientSecret will appear in the vuex state
      // Watcher will see this and run `check3ds` method
    },
    formatTokenPayload (token) {
      let platform = this.stripeConfig.hasOwnProperty('backendPlatform') ? this.stripeConfig.backendPlatform : 'default'
      if (platform === 'magento2') {
        return {
          cc_save: false,
          cc_stripejs_token: `${token.id}:${token.card.brand}:${token.card.last4}`
        }
      } else {
        return token
      }
    },

    check3ds () {
      const self = this
      // Needed 3ds
      return this.stripe.instance.confirmCardPayment(this.clientSecret).then((threedResult) => {
        // console.log('3D',threedResult)
        // this.stripe.instance.handleCardAction
        if (threedResult.error) {
          // Inform the user if there was an error.
          let errorElement = document.getElementById('vsf-stripe-card-errors')

          errorElement.textContent = threedResult.error.message

          // Stop display loader 
          self.$bus.$emit('notification-progress-stop')
          self.$store.commit('stripe/setClientSecret', null)
          self.$store.commit('stripe/setThreeDsFailed', true)
        } else {
          self.placeOrderWithPayload(self.formatedCardData)
        }
      })
    }
  }
}
</script>

<style lang="scss" scoped>

  .vsf-stripe-container {
    margin: 3rem 0 4rem 0;

    label {
      font-weight: 500;
      font-size: 14px;
      display: block;
      margin-bottom: 8px;
      color: #818992;
    }

    .StripeElement {
      background-color: white;
      padding: 10px 12px;
      border-radius: 4px;
      border: 1px solid transparent;
      box-shadow: 0 1px 3px 0 #e6ebf1;
      -webkit-transition: box-shadow 150ms ease;
      transition: box-shadow 150ms ease;
    }

    .StripeElement--focus {
      box-shadow: 0 1px 3px 0 #cfd7df;
    }

    .StripeElement--invalid {
      border-color: #fa755a;
    }

    .StripeElement--webkit-autofill {
      background-color: #fefde5 !important;
    }
  }
  #vsf-stripe-card-errors {
    margin: 8px auto 0;
    color: #fa755a;
  }
</style>
