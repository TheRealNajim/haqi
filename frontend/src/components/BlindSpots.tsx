interface Props {
  items: string[];
}

export function BlindSpots({ items }: Props) {
  if (!items.length) return null;

  return (
    <aside className="blind-spots" aria-label="What we could not see">
      <h2>What we could not see</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  );
}
