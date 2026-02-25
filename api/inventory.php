<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/middleware.php';
require_once __DIR__ . '/response.php';

// Require authentication
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];

function syncInventoryStatuses($pdo) {
    $stmt = $pdo->prepare("
        UPDATE inventory
        SET status = CASE
            WHEN quantity <= 0 THEN 'Out of Stock'
            WHEN min_quantity > 0 AND quantity <= min_quantity THEN 'Low Stock'
            ELSE 'In Stock'
        END
    ");
    $stmt->execute();
}

try {
    switch ($method) {

        case 'GET':
            // Ensure persisted status matches actual quantity thresholds.
            syncInventoryStatuses($pdo);

            // Get all inventory items
            $stmt = $pdo->query("SELECT 
                    i.id,
                    i.description AS name,
                    i.quantity AS stocks,
                    i.status,
                    i.unit_price AS price,
                    i.srp_private,
                    i.srp_lgu,
                    i.srp_stan,
                    i.code,
                    i.part_number,
                    i.category,
                    i.min_quantity,
                    i.company_codename
                FROM inventory i
                ORDER BY i.description ASC
            ");

            $items = $stmt->fetchAll();
            sendSuccess($items);
            break;

        case 'POST':
            // Create new inventory item
            $data = json_decode(file_get_contents('php://input'), true);

            $name = trim($data['name'] ?? '');
            $quantity = intval($data['quantity'] ?? $data['stocks'] ?? 0);
            $price = floatval($data['price'] ?? 0);
            $srpPrivate = floatval($data['srpPrivate'] ?? $data['srp_private'] ?? 0);
            $srpLgu = floatval($data['srpLgu'] ?? $data['srp_lgu'] ?? 0);
            $srpStan = floatval($data['srpStan'] ?? $data['srp_stan'] ?? 0);
            $code = trim($data['code'] ?? '');
            $partNumber = trim($data['partNumber'] ?? $data['part_number'] ?? '');
            $category = trim($data['category'] ?? '');
            $minQuantity = intval($data['minQuantity'] ?? 0);
            $companyCodename = trim($data['companyCodename'] ?? '');

            if (empty($name)) {
                sendValidationError('Product name is required');
            }

            if ($price <= 0) {
                sendValidationError('Price must be greater than 0');
            }

            // Generate code if not provided
            if (empty($code)) {
                $code = strtoupper(substr($name, 0, 3)) . rand(100, 999);
            }

            // Default category
            if (empty($category)) {
                $category = 'General';
            }

            // Calculate status
            $status = 'In Stock';
            if ($quantity <= 0) {
                $status = 'Out of Stock';
            } elseif ($minQuantity > 0 && $quantity <= $minQuantity) {
                $status = 'Low Stock';
            }

            // ✅ COMPUTE SRP VALUES (based on your React computation)
            if ($srpPrivate <= 0) $srpPrivate = round($price * 1.25 * 1.12, 2);
            if ($srpLgu <= 0) $srpLgu = round($price * 1.60 * 1.12, 2);
            if ($srpStan <= 0) $srpStan = round($price * 1.30 * 1.12, 2);

            $stmt = $pdo->prepare("INSERT INTO inventory (
                code, part_number, description, category, quantity, min_quantity,
                unit_price, srp_private, srp_lgu, srp_stan, status, company_codename
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            $stmt->execute([
                $code,
                $partNumber,
                $name,
                $category,
                $quantity,
                $minQuantity,
                $price,
                $srpPrivate,
                $srpLgu,
                $srpStan,
                $status,
                $companyCodename
            ]);

            $id = $pdo->lastInsertId();

            $stmt = $pdo->prepare("SELECT 
                    i.id,
                    i.description AS name,
                    i.quantity AS stocks,
                    i.status,
                    i.unit_price AS price,
                    i.srp_private,
                    i.srp_lgu,
                    i.srp_stan,
                    i.code,
                    i.part_number,
                    i.category,
                    i.min_quantity,
                    i.company_codename
                FROM inventory i
                WHERE i.id = ?
            ");
            $stmt->execute([$id]);
            $item = $stmt->fetch();

            sendSuccess($item, 'Item added successfully');
            break;

        case 'PUT':
            // Update inventory item
            $data = json_decode(file_get_contents('php://input'), true);
            $id = intval($data['id'] ?? 0);

            if ($id <= 0) {
                sendValidationError('Invalid item ID');
            }

            $name = trim($data['name'] ?? '');
            $quantity = intval($data['quantity'] ?? $data['stocks'] ?? 0);
            $price = floatval($data['price'] ?? 0);
            $srpPrivate = floatval($data['srpPrivate'] ?? $data['srp_private'] ?? 0);
            $srpLgu = floatval($data['srpLgu'] ?? $data['srp_lgu'] ?? 0);
            $srpStan = floatval($data['srpStan'] ?? $data['srp_stan'] ?? 0);
            $code = trim($data['code'] ?? '');
            $partNumber = trim($data['partNumber'] ?? $data['part_number'] ?? '');
            $category = trim($data['category'] ?? '');
            $minQuantity = intval($data['minQuantity'] ?? 0);
            $companyCodename = trim($data['companyCodename'] ?? '');

            if (empty($name)) {
                sendValidationError('Product name is required');
            }

            // Calculate status
            $status = 'In Stock';
            if ($quantity <= 0) {
                $status = 'Out of Stock';
            } elseif ($minQuantity > 0 && $quantity <= $minQuantity) {
                $status = 'Low Stock';
            }

            // ✅ COMPUTE SRP VALUES
            if ($srpPrivate <= 0 || $srpLgu <= 0 || $srpStan <= 0) {
                $stmt = $pdo->prepare("SELECT srp_private, srp_lgu, srp_stan FROM inventory WHERE id = ?");
                $stmt->execute([$id]);
                $existingSrp = $stmt->fetch();
                if (!$existingSrp) {
                    sendValidationError('Item not found');
                }
                if ($srpPrivate <= 0) $srpPrivate = floatval($existingSrp['srp_private'] ?? 0);
                if ($srpLgu <= 0) $srpLgu = floatval($existingSrp['srp_lgu'] ?? 0);
                if ($srpStan <= 0) $srpStan = floatval($existingSrp['srp_stan'] ?? 0);
            }

            $stmt = $pdo->prepare("UPDATE inventory SET 
                code = ?, 
                part_number = ?,
                description = ?, 
                category = ?, 
                quantity = ?, 
                min_quantity = ?, 
                unit_price = ?, 
                srp_private = ?, 
                srp_lgu = ?, 
                srp_stan = ?,
                status = ?,  
                company_codename = ?
            WHERE id = ?");

            $stmt->execute([
                $code,
                $partNumber,
                $name,
                $category,
                $quantity,
                $minQuantity,
                $price,
                $srpPrivate,
                $srpLgu,
                $srpStan,
                $status,
                $companyCodename,
                $id
            ]);

            $stmt = $pdo->prepare("SELECT 
                    i.id,
                    i.description AS name,
                    i.quantity AS stocks,
                    i.status,
                    i.unit_price AS price,
                    i.srp_private,
                    i.srp_lgu,
                    i.srp_stan,
                    i.code,
                    i.part_number,
                    i.category,
                    i.min_quantity,
                    i.company_codename
                FROM inventory i
                WHERE i.id = ?
            ");
            $stmt->execute([$id]);
            $item = $stmt->fetch();

            sendSuccess($item, 'Item updated successfully');
            break;

        case 'DELETE':
            // Delete inventory item
            $data = json_decode(file_get_contents('php://input'), true);
            $id = intval($data['id'] ?? 0);

            if ($id <= 0) {
                sendValidationError('Invalid item ID');
            }

            $stmt = $pdo->prepare("DELETE FROM inventory WHERE id = ?");
            $stmt->execute([$id]);

            sendSuccess(null, 'Item deleted successfully');
            break;

        default:
            sendError('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
    }

} catch (PDOException $e) {
    sendError('Database error: ' . $e->getMessage(), 'DATABASE_ERROR', 500);
} catch (Exception $e) {
    sendError($e->getMessage(), 'ERROR', 500);
}
?>
