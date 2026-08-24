// script.js
function updatePrice(select) {
    const row = select.closest('tr');
    const priceInput = row.querySelector('.price');
    priceInput.value = select.value;
    calculateRow(select);
}

function calculateRow(input) {
    const row = input.closest('tr');
    const price = parseFloat(row.querySelector('.price').value) || 0;
    const quantity = parseInt(row.querySelector('.quantity').value) || 0;
    const discount = parseFloat(row.querySelector('.discount').value) || 0;

    const amount = (price * quantity) * (1 - discount / 100);
    row.querySelector('.amount').value = amount.toFixed(2);

    calculateTotal();
}

function calculateTotal() {
    let total = 0;
    document.querySelectorAll('.amount').forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    document.getElementById('totalAmount').textContent = total.toFixed(2);
}

function addRow() {
    const tbody = document.querySelector('#commandeTable tbody');
    const newRow = tbody.querySelector('tr').cloneNode(true);

    newRow.querySelector('.article').value = '';
    newRow.querySelector('.price').value = '';
    newRow.querySelector('.quantity').value = 1;
    newRow.querySelector('.discount').value = 0;
    newRow.querySelector('.amount').value = '';

    const actionButton = newRow.querySelector('button');
    actionButton.textContent = '-';
    actionButton.setAttribute('onclick', "this.closest('tr').remove(); calculateTotal()");

    tbody.appendChild(newRow);
}

function submitForm() {
    const vendeur = {
        entreprise: document.getElementById('vendorCompany').value,
        prenom: document.getElementById('vendorFirstName').value,
        adresse: document.getElementById('vendorAddress').value,
        codePostal: document.getElementById('vendorZip').value,
        telephone: document.getElementById('vendorPhone').value,
        email: document.getElementById('vendorEmail').value
    };

    const client = {
        nom: document.getElementById('clientName').value,
        prenom: document.getElementById('clientFirstName').value,
        adresse: document.getElementById('clientAddress').value,
        codePostal: document.getElementById('clientZip').value,
        telephone: document.getElementById('clientPhone').value,
        email: document.getElementById('clientEmail').value
    };

    const lignes = [];
    document.querySelectorAll('#commandeTable tbody tr').forEach(row => {
        const articleSelect = row.querySelector('.article');
        const designation = articleSelect.selectedIndex > 0
            ? articleSelect.options[articleSelect.selectedIndex].text
            : '';

        lignes.push({
            designation: designation,
            prix: parseFloat(row.querySelector('.price').value) || 0,
            quantite: parseInt(row.querySelector('.quantity').value) || 0,
            remise: parseFloat(row.querySelector('.discount').value) || 0,
            montant: parseFloat(row.querySelector('.amount').value) || 0
        });
    });

    const commande = {
        vendeur: vendeur,
        client: client,
        lignes: lignes,
        total: document.getElementById('totalAmount').textContent
    };

    console.log('Commande :', commande);
    alert(`Commande validée !\nTotal: ${commande.total} €`);
}
