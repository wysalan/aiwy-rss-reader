<script setup lang="ts">
import type { ArticleItem } from '../types'

defineProps<{
  items: ArticleItem[]
  isRead: (id: string) => boolean
  isStarred: (id: string) => boolean
  error?: { title: string; url: string; error: string } | null
}>()
const emit = defineEmits<{
  open: [it: ArticleItem]
  toggleStar: [it: ArticleItem]
  retry: [url: string]
}>()

function fmtDate(d: string) {
  const t = new Date(d)
  if (isNaN(t.getTime())) return ''
  return Intl.DateTimeFormat('zh-Hant', { year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hour12: false }).format(t)
}
</script>

<template>
  <div class="overflow-y-auto py-1.5 flex-1">
    <div v-if="!items.length && error" class="flex flex-col items-center gap-2 text-muted p-10 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
      <div class="text-highlighted font-medium">{{ error.title }} 載入失敗</div>
      <div>{{ error.error }}</div>
      <UButton icon="i-lucide-refresh-cw" data-navi color="neutral" variant="subtle" class="mt-1" @click="emit('retry', error.url)">重試</UButton>
    </div>
    <div v-else-if="!items.length" class="flex flex-col items-center gap-2 text-muted p-10 text-center">
      <UIcon name="i-lucide-inbox" class="size-8" />
      目前沒有文章，新增訂閱或換個篩選條件試試。
    </div>
    <article
      v-for="it in items"
      :key="it.id"
      data-navi
      tabindex="0"
      class="group px-4.5 py-3 border-b border-default cursor-pointer hover:bg-elevated"
      :class="!isRead(it.id) && 'unread border-l-2 border-l-primary pl-4'"
      @click="emit('open', it)"
    >
      <h3 class="m-0 mb-1 text-base text-highlighted group-[.unread]:font-bold">
        <a class="text-inherit no-underline hover:underline" :href="it.link" target="_blank" rel="noopener" @click="emit('open', it)">{{ it.title }}</a>
      </h3>
      <div class="text-xs text-muted flex gap-2 items-center">
        <UButton
          icon="i-lucide-star"
          data-star
          :color="isStarred(it.id) ? 'warning' : 'neutral'"
          variant="ghost"
          size="xs"
          :class="isStarred(it.id) ? 'text-amber-500' : 'text-muted'"
          :title="isStarred(it.id) ? '取消收藏' : '收藏'"
          @click.stop="emit('toggleStar', it)"
        />
        <span>{{ it.source }}</span>
        <span v-if="it.date" class="select-none">·</span>
        <span v-if="it.date">{{ fmtDate(it.date) }}</span>
      </div>
      <p v-if="it.summary" class="mt-1.5 mb-0 text-muted text-sm leading-normal">{{ it.summary }}</p>
    </article>
  </div>
</template>
