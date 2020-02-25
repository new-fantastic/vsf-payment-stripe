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
            &nbsp;
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
      processing: false
    }
  },
  computed: {
    ...mapState({
      stripeConfig: state => state.config.stripe
    }),
    checkout () {
      return this.$store.state.checkout
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
      this.processing = true
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
          this.processing = false
        } else {
          let clientSecret = await this.fetchClientSecret(self.formatTokenPayload(cardResult.paymentMethod))
          if (!clientSecret) {
            this.$store.dispatch('notification/spawnNotification', {
              type: 'error',
              message: this.$t('Could not fetch client secret, sorry'),
              action1: { label: this.$t('OK') }
            })
            this.processing = false
            return
          }

          this.stripe.instance.confirmCardPayment(clientSecret).then((threedResult) => {
            // console.log('3D',threedResult)
            // this.stripe.instance.handleCardAction
            if (threedResult.error) {
              // Inform the user if there was an error.
              let errorElement = document.getElementById('vsf-stripe-card-errors')

              errorElement.textContent = threedResult.error.message
              // console.log(threedResult)

              // Stop display loader 
              self.$bus.$emit('notification-progress-stop')
              this.processing = false
            } else {
              self.placeOrderWithPayload(this.formatTokenPayload(cardResult.paymentMethod))
              // console.log(cardResult)
              // this.processing = false
            }
          })
        }
      })
    },
    placeOrderWithPayload (payload) {
      this.$bus.$emit('checkout-do-placeOrder', payload)
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

    async fetchClientSecret (token) {
      try {
        const cartId = this.$store.getters['cart/getCartToken']
        const userToken = this.$store.getters['user/getUserToken']
        const { result } = await (await fetch(adjustMultistoreApiUrl(
          `${config.api.url.endsWith('/') ? config.api.url : config.api.url + '/'}api/ext/stripe/init?token=${userToken}&cartId=${cartId}`),
          {
            method: 'POST',
            body: JSON.stringify({
              email: this.checkout.personalDetails.emailAddress,
              paymentMethod: {
                method: 'stripe_payments',
                additional_data: token
              },
              billingAddress: {
                firstname: this.checkout.paymentDetails.firstName,
                lastname: this.checkout.paymentDetails.lastName,
                country_id: this.checkout.paymentDetails.country,
                telephone: this.checkout.paymentDetails.phoneNumber,
                postcode: this.checkout.paymentDetails.zipCode,
                street: [
                  this.checkout.paymentDetails.streetAddress,
                  this.checkout.paymentDetails.apartmentNumber
                ],
                telephone: this.checkout.paymentDetails.phoneNumber,
                city: this.checkout.paymentDetails.city
              }
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          }
          )).json()

        return result.client_secret
      } catch (err) {
        console.log(err)
      }
      return
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
