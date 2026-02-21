import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

interface Props {
  text: string
  className?: string
  tag?: 'h2' | 'h3' | 'p'
}

export default function ScrollRevealText({ text, className = '', tag = 'h2' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.95', 'start 0.65'],
  })

  const words = text.split(' ')
  const Tag = tag

  return (
    <div ref={ref}>
      <Tag className={className}>
        {words.map((word, i) => {
          const start = i / words.length
          const end = start + 1 / words.length
          return <Word key={i} word={word} range={[start, end]} progress={scrollYProgress} />
        })}
      </Tag>
    </div>
  )
}

function Word({
  word,
  range,
  progress,
}: {
  word: string
  range: [number, number]
  progress: ReturnType<typeof useScroll>['scrollYProgress']
}) {
  const opacity = useTransform(progress, range, [0.15, 1])

  return (
    <motion.span
      style={{ opacity }}
      className="inline-block mr-[0.3em]"
    >
      {word}
    </motion.span>
  )
}
