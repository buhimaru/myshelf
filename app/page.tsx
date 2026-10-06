import { mediaItems } from "../data/media";

export default function Home() {
  return (
    <main>
      <h1>myshelf</h1>
      <p>好きな作品を、自分だけの棚に。</p>

      <h2>作品一覧</h2>

      {mediaItems.map((item) => (
        <div key={item.id}>
          <h3>{item.title}</h3>
          <p>{item.creator}</p>
          <p>{item.type}</p>
        </div>
      ))}
    </main>
  );
}