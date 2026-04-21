import { Tabs } from 'nextra/components'

function PackageManagerLabel({ color, name, mark }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        fontWeight: 800,
      }}
    >
      <span
        aria-hidden
        style={{
          width: '0.8rem',
          height: '0.8rem',
          borderRadius: '3px',
          border: '2px solid #000',
          background: color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.52rem',
          lineHeight: 1,
          color: '#000',
          fontWeight: 900,
        }}
      >
        {mark}
      </span>
      <span>{name}</span>
    </span>
  )
}

const ITEMS = [
  { label: <PackageManagerLabel color="#F9AD00" name="pnpm" mark="P" /> },
  { label: <PackageManagerLabel color="#CB3837" name="npm" mark="N" /> },
  { label: <PackageManagerLabel color="#2C8EBB" name="yarn" mark="Y" /> },
]

function PackageManagerTabs(props) {
  return <Tabs items={ITEMS} {...props} />
}

PackageManagerTabs.Tab = Tabs.Tab

export { PackageManagerTabs }
