<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PaymentMethod } from '../../api/paymentMethods'

const props = defineProps<{
  modelValue: string
  methods: PaymentMethod[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { locale, t } = useI18n({ useScope: 'global' })
const localeKey = computed<'en' | 'th'>(() => (locale.value === 'th' ? 'th' : 'en'))

function pick(id: string) {
  emit('update:modelValue', id)
}
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="text-base font-semibold text-foreground mb-2">
      {{ t('payment.selectMethod') }}
    </legend>
    <label
      v-for="m in methods"
      :key="m.id"
      :class="[
        'flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors',
        modelValue === m.id ? 'border-primary bg-primary/10' : 'border-sand bg-surface-alt hover:border-primary/50',
      ]"
    >
      <input
        type="radio"
        :value="m.id"
        :checked="modelValue === m.id"
        class="text-primary focus:ring-primary"
        @change="pick(m.id)"
      />
      <span class="font-medium text-foreground">{{ m.name[localeKey] }}</span>
    </label>
  </fieldset>
</template>
