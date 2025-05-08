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
    const newRow = tbody.insertRow();
    
    newRow.innerHTML = `
        <td>
            <select class="article" onchange="updatePrice(this)">
                <option value="">Sélectionnez un article</option>
                <option value="50">Ordinateur portable - 50€</option>
                <option value="30">Souris sans fil - 30€</option>
                <option value="100">Écran 24 pouces - 100€</option>
                <option value="20">Clavier mécanique - 20€</option>
                <option value="15">Casque audio - 15€</option>
            </select>
        </td>
        <td><input type="number" class="price" readonly></td>
        <td><input type="number" class="quantity" min="1" value="1" onchange="calculateRow(this)"></td>
        <td><input type="number" class="discount" min="0" max="100" value="0" onchange="calculateRow(this)"></td>
        <td><input type="number" class="amount" readonly></td>
        <td><button type="button" onclick="this.closest('tr').remove(); calculateTotal()">-</button></td>
    `;
}

function submitForm() {
    alert(`Commande validée !\nTotal: ${document.getElementById('totalAmount').textContent} €`);
}