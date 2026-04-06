import { computed, ref, watch } from 'vue'
import data from '../data/th-address.json'

// Data format: p = [code, nameEn][], d = [provinceCode, districtCode, nameEn][], s = [districtCode, nameEn, postalCode][]
const provinces = (data.p as [number, string][]).map(([code, name]) => ({ code, name }))
const districts = (data.d as [number, number, string][]).map(([provinceCode, code, name]) => ({ provinceCode, code, name }))
const subdistricts = (data.s as [number, string, number][]).map(([districtCode, name, postalCode]) => ({ districtCode, name, postalCode }))

// Pre-build lookup maps for fast filtering
const districtsByProvince = new Map<number, typeof districts>()
for (const d of districts) {
  const list = districtsByProvince.get(d.provinceCode)
  if (list) list.push(d)
  else districtsByProvince.set(d.provinceCode, [d])
}

const subdistrictsByDistrict = new Map<number, typeof subdistricts>()
for (const s of subdistricts) {
  const list = subdistrictsByDistrict.get(s.districtCode)
  if (list) list.push(s)
  else subdistrictsByDistrict.set(s.districtCode, [s])
}

const provinceByName = new Map<string, number>()
for (const p of provinces) provinceByName.set(p.name, p.code)

const districtByKey = new Map<string, number>()
for (const d of districts) districtByKey.set(`${d.provinceCode}:${d.name}`, d.code)

export function useThaiAddress() {
  const selectedProvince = ref('')
  const selectedDistrict = ref('')
  const selectedSubdistrict = ref('')
  const postalCode = ref('')

  // Guard flag to skip reset watchers during programmatic restore
  let restoring = false

  const filteredDistricts = computed(() => {
    const code = provinceByName.get(selectedProvince.value)
    if (code === undefined) return []
    return (districtsByProvince.get(code) ?? []).sort((a, b) => a.name.localeCompare(b.name))
  })

  const filteredSubdistricts = computed(() => {
    const provCode = provinceByName.get(selectedProvince.value)
    if (provCode === undefined) return []
    const distCode = districtByKey.get(`${provCode}:${selectedDistrict.value}`)
    if (distCode === undefined) return []
    return (subdistrictsByDistrict.get(distCode) ?? []).sort((a, b) => a.name.localeCompare(b.name))
  })

  // Reset downstream when province changes (skipped during restore)
  watch(selectedProvince, () => {
    if (restoring) return
    selectedDistrict.value = ''
    selectedSubdistrict.value = ''
    postalCode.value = ''
  })

  // Reset subdistrict when district changes (skipped during restore)
  watch(selectedDistrict, () => {
    if (restoring) return
    selectedSubdistrict.value = ''
    postalCode.value = ''
  })

  // Auto-fill postal code when subdistrict is selected
  watch(selectedSubdistrict, (name) => {
    if (restoring) return
    if (!name) { postalCode.value = ''; return }
    const match = filteredSubdistricts.value.find((s) => s.name === name)
    if (match) postalCode.value = String(match.postalCode)
  })

  /**
   * Restore a saved address atomically without triggering reset watchers.
   * Reverse-looks up the subdistrict from district + postal code.
   */
  function setAddress(addr: { province?: string; district?: string; postalCode?: string }) {
    restoring = true
    if (addr.province) selectedProvince.value = addr.province
    if (addr.district) selectedDistrict.value = addr.district
    if (addr.postalCode) postalCode.value = addr.postalCode

    // Reverse-lookup subdistrict from district + postal code
    if (addr.district && addr.postalCode) {
      const provCode = provinceByName.get(selectedProvince.value)
      if (provCode !== undefined) {
        const distCode = districtByKey.get(`${provCode}:${addr.district}`)
        if (distCode !== undefined) {
          const subs = subdistrictsByDistrict.get(distCode) ?? []
          const match = subs.find((s) => String(s.postalCode) === addr.postalCode)
          if (match) selectedSubdistrict.value = match.name
        }
      }
    }
    restoring = false
  }

  return {
    provinces,
    selectedProvince,
    selectedDistrict,
    selectedSubdistrict,
    postalCode,
    filteredDistricts,
    filteredSubdistricts,
    setAddress,
  }
}
