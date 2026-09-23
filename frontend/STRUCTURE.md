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
