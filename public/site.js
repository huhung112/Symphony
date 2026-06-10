const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');

if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
        const isOpen = document.body.classList.toggle('nav-open');
        menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    siteNav.addEventListener('click', event => {
        if (event.target.matches('a')) {
            document.body.classList.remove('nav-open');
            menuToggle.setAttribute('aria-expanded', 'false');
        }
    });
}

document.querySelectorAll('.team-select').forEach(select => {
    select.addEventListener('change', () => {
        if (select.value) window.location.href = select.value;
    });
});

const animatedSelectors = [
    '.mini-card',
    '.preview-card',
    '.team-panel',
    '.score-bar',
    '.podium-card',
    '.video-card',
    '.gallery-card',
    '.other-team-card',
    '.media-panel',
    '.ranking-search-card',
    '.finder-card',
    '.contact-form',
    '.contact-card'
];

document.querySelectorAll(animatedSelectors.join(',')).forEach((element, index) => {
    element.classList.add('reveal');
    element.style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 70}ms`);
});

const revealElements = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.16,
        rootMargin: '0px 0px -8% 0px'
    });

    revealElements.forEach(element => revealObserver.observe(element));
} else {
    revealElements.forEach(element => element.classList.add('is-visible'));
}
