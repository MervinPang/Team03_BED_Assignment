document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('stallGrid'),
        search = document.getElementById('stallSearch');

    function render() {
        const q = search.value.trim().toLowerCase(),
            list = HAWKER_DATA.stalls.filter(s => `${s.StallName} ${s.Cuisine}`.toLowerCase().includes(q));
        grid.innerHTML = list.map(s => `<article class="card stall-card"><img src="${s.StallImage}" alt="${esc(s.StallName)}"><div class="stall-body stack"><div class="row-between"><span class="badge ${s.IsAvailable ? 'success' : 'unavailable'}">${s.IsAvailable ? 'Open' : 'Unavailable'}</span><span class="small muted">${esc(s.Cuisine)}</span></div><div><h3>${esc(s.StallName)}</h3><p class="muted">${esc(s.Description)}</p></div><a class="button primary" href="${s.IsAvailable ? `/menu.html?stall=${s.StallID}` : '#'}">${s.IsAvailable ? 'View Menu' : 'Currently unavailable'}</a></div></article>`).join('') || '<div class="card empty">No stalls found.</div>'
    }
    search.oninput = render;
    render()
});
