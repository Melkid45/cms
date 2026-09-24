# HTML-структура frontend

Проект использует HTML-layout и рекурсивные `@include`, как проект `vintage`.
Vite при сборке вставляет HTML-фрагменты в страницу и переносит подключённые
рядом с ними стили в `<head>`.

```text
src/
├── _components/
│   ├── sections/                 # Блоки страниц
│   │   └── intro/
│   │       ├── components/       # Компоненты только этого блока
│   │       ├── intro.html
│   │       └── intro.scss
│   └── ui/                       # Общие компоненты
│       └── button/
│           ├── button.html
│           └── button.scss
├── _layouts/
│   └── base.html                 # Общая HTML-оболочка
├── _pages/
│   └── home/
│       └── home.scss             # Стили конкретной страницы
├── styles/                       # Глобальные SCSS-стили и токены
└── main.js                       # Общий JavaScript
```

## Новый блок

Каждый блок хранит HTML и CSS рядом:

```html
<link rel="stylesheet" href="./example.scss" />

<section class="example">
  ...
</section>
```

На странице он подключается одной строкой:

```html
<!-- @include src/_components/sections/example/example.html -->
```

Стили блока и всех вложенных компонентов будут добавлены автоматически.

## Отступ 24px

Для частого интервала в 24px используйте семантические утилиты:

```html
<div class="flex column spacing--content padding--content">...</div>
```

`spacing--content` задаёт `gap: 24px`, а `padding--content` — внутренний
отступ 24px. Значение хранится в токене `--gap-content`.

## Изображения

Все контентные изображения помещаются в единый компонент `.media`. Размер
задаётся контейнеру, а изображение автоматически получает корректный crop:

```html
<figure class="media media--landscape" data-position="top">
  <img src="..." alt="Описание изображения">
</figure>
```

Готовые размеры: `media--hero`, `media--landscape`, `media--card`,
`media--strip`, `media--square`, `media--portrait`. Для уникального блока можно
переопределить CSS-переменные без изменения глобальных стилей:

```html
<figure class="media" style="--media-aspect: 4 / 3; --media-height: 420px;">
  <img src="..." alt="">
</figure>
```

Доступны `data-fit="contain"`, `data-position="top"` и
`data-position="bottom"`.

## Кнопки и рамки

У кнопок есть основной, контурный и белый варианты. Эти же классы работают
одинаково для `<button>` и `<a>` и включают hover/focus-состояния:

```html
<a class="button button--primary" href="#contact">Book now</a>
<a class="button button--secondary" href="tel:+12125550198">Call us</a>
<button class="button button--white">Get started</button>
<a class="button button--outline-white" href="tel:+12125550198">Call us</a>
```

Цвет рамки можно задать любым цветовым токеном:

```html
<div class="border-[--gray-300]">...</div>
<a class="button button--white border-[--color-bg]" href="#contact">Book now</a>
```

## Новая страница

Создайте HTML-файл в корне проекта и укажите layout:

```html
<!-- @layout src/_layouts/base.html -->
<link rel="stylesheet" href="@/_pages/example/example.scss" />

<main>
  <!-- @include src/_components/sections/example/example.html -->
</main>
```

Все корневые `.html`-файлы автоматически становятся отдельными точками сборки Vite.
