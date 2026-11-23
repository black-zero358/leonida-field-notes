"""Build the five standalone guide pages from their shared navigation and shell."""
from hashlib import sha256
from pathlib import Path
from string import Template

TOOLS = Path(__file__).resolve().parent
PUBLIC = TOOLS.parent / "public"
PAGES = {
    "chapter": ("剧情攻略", "book", "按当前章节和任务查看游玩提示、收集窗口与已登场人物。"),
    "weapons": ("武器备忘", "mark", "核对本章限定武器的领取任务、截止窗口，并标记已经取得的物品。"),
    "missions": ("任务与解锁", "key", "按游玩进度查看任务开放的功能，并核对本章任务清单。"),
    "people": ("人物名录", "people", "按当前游玩进度查看已登场人物的中英文姓名、头像与相关资料。"),
    "references": ("资料来源", "compass", "查阅本章使用的中文译名、攻略资料与人物头像出处。"),
}


def page_href(root, page):
    return root if page == "chapter" else f"{root}{page}/"


def icon(name):
    return f'<svg aria-hidden="true"><use href="#i-{name}"/></svg>'


def navigation(page, root):
    links = []
    for slug, (label, symbol, _) in PAGES.items():
        current = ' aria-current="page"' if slug == page else ""
        links.append(f'      <a data-page-link="{slug}" href="{page_href(root, slug)}"{current}>{icon(symbol)}{label}</a>')
    return "\n".join(links)


CHAPTER_HEADING = """<div class="chapter-heading">
  <p><span id="chapter-index">第一章</span><span class="chapter-dot">·</span><span id="chapter-name">当前手记</span></p>
  <span id="chapter-original" lang="en"></span>
</div>"""
MISSION_NAME = '<span id="current-mission">尚未记录</span><span id="current-original" lang="en"></span>'
EDIT = f'<button type="button" class="edit" data-open>{icon("slider")}调整进度</button>'
FOOTER = '<footer class="footer"><span>日落路书</span><span>GTA VI 非官方游玩手记</span></footer>'


def overview():
    entries = [
        ("weapons", "weapon", "weapon-count", "领取窗口与收录状态"),
        ("missions", "mission", "mission-count", "任务对应的开放功能"),
        ("people", "people", "people-count", "已登场人物与身份"),
        ("references", None, None, "本章攻略、译名与图片出处"),
    ]
    links = []
    for page, mark, count_id, description in entries:
        artwork = f'<img alt="" src="assets/marks/{mark}.webp">' if mark else icon('compass')
        count = f'<span class="overview-count" id="{count_id}"></span>' if count_id else ''
        links.append(f'''<a class="overview-link" data-page-link="{page}" href="{page}/">
          <span class="overview-art">{artwork}</span>
          <span class="overview-name"><strong>{PAGES[page][0]}</strong><small>{description}</small></span>
          {count}<span class="overview-arrow" aria-hidden="true">↗</span>
        </a>''')
    return "\n".join(links)


def chapter_page():
    return f'''    <div class="desk-grid">
      <div class="desk-core">
        <section id="chapter" aria-labelledby="current-mission">
          {CHAPTER_HEADING}
          <div class="mission-heading">
            <div class="mission-type"><p class="mission-tag" id="progress-label">当前任务</p><h1>{MISSION_NAME}</h1></div>
            {EDIT}
          </div>
          <div class="advice">
            <div class="advice-top">
              <span class="advice-label">{icon("compass")}本章提示</span><div id="focus-note" class="focus-note" hidden></div>
              <button id="final-toggle" class="reveal" type="button" aria-expanded="false" aria-controls="final-note">{icon("chevron")}<span>查看章末任务</span></button>
            </div>
            <p id="final-note" class="final-note" hidden></p>
          </div>
        </section>
        <nav id="chapter-overview" class="overview" aria-label="本章栏目">
          {overview()}
        </nav>
        {FOOTER}
      </div>
      <aside id="portrait-rail" class="portrait-rail" aria-label="本章人物图册"></aside>
    </div>'''


def disclosure(element_id, label, contents, hidden=False):
    visibility = " hidden" if hidden else ""
    return f'<details class="disclosure" id="{element_id}"{visibility}><summary>{label}{icon("chevron")}</summary>{contents}</details>'


def column_page(page, root):
    materials = {
        "weapons": ("weapon", "本章可获取物品", "weapon-count",
                    '<div id="weapon-list"></div>' + disclosure("field-notes", "其他领取窗口与可选事项", '<div id="field-list"></div>', True)),
        "missions": ("mission", "本章任务解锁", "mission-count",
                     '<div id="unlock-list"></div>' + disclosure("all-missions", "本章任务清单", '<div id="mission-list"></div>') +
                     '<p class="context-note" id="chapter-note" hidden></p><button class="secondary next-chapter" type="button" id="next-chapter" hidden>已进入下一章</button>'),
        "people": ("people", "已登场人物", "people-count", '<div id="people-list" class="people-list"></div>'),
        "references": (None, "本章资料", None, '<div id="sources"></div>'),
    }
    label = PAGES[page][0]
    mark, section_name, count_id, content = materials[page]
    mark_html = f'<img alt="" src="{root}assets/marks/{mark}.webp">' if mark else icon('compass')
    count = f'<span class="section-count" id="{count_id}"></span>' if count_id else ''
    return f'''    <div class="folio">
      <header class="folio-header">
        {CHAPTER_HEADING}
        <h1>{label}</h1>
        <div class="folio-progress">
          <div class="progress-context"><span class="mission-tag" id="progress-label">当前任务</span><p>{MISSION_NAME}</p></div>
          {EDIT}
        </div>
      </header>
      <section class="folio-section" id="{page}" aria-labelledby="section-title">
        <div class="folio-section-head"><h2 id="section-title">{mark_html}{section_name}</h2>{count}</div>
        {content}
      </section>
      {FOOTER}
    </div>'''


def asset_hash(name):
    return sha256((PUBLIC / name).read_bytes()).hexdigest()[:10]


def main():
    shell = Template((TOOLS / "page-shell.html").read_text(encoding="utf-8"))
    hashes = {f"{kind}_hash": asset_hash(name) for kind, name in
              [("style", "style.css"), ("data", "guide-data.js"), ("app", "app.js")]}
    for page, (label, _, description) in PAGES.items():
        home = page == "chapter"
        root = "./" if home else "../"
        destination = PUBLIC if home else PUBLIC / page
        destination.mkdir(exist_ok=True)
        title = "日落路书 · GTA VI 无剧透游玩手记" if home else f"{label} · 日落路书"
        html = shell.substitute(hashes, title=title, description=description, root=root,
                                page=page, navigation=navigation(page, root),
                                content=chapter_page() if home else column_page(page, root))
        (destination / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
