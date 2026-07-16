// Reports instructions with direct-memory scalar operands inside an offset range.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;

public class ReportDirectMemoryRange extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length != 2) {
            throw new IllegalArgumentException("Expected inclusive hexadecimal low/high offsets");
        }
        long low = Long.parseLong(args[0].replaceFirst("^0[xX]", ""), 16);
        long high = Long.parseLong(args[1].replaceFirst("^0[xX]", ""), 16);
        if (low > high) {
            throw new IllegalArgumentException("Low offset exceeds high offset");
        }

        int matches = 0;
        InstructionIterator instructions = currentProgram.getListing().getInstructions(true);
        while (instructions.hasNext()) {
            Instruction instruction = instructions.next();
            for (int operand = 0; operand < instruction.getNumOperands(); operand++) {
                String representation = instruction.getDefaultOperandRepresentation(operand);
                if (!representation.contains("[")) {
                    continue;
                }
                for (Object object : instruction.getOpObjects(operand)) {
                    if (!(object instanceof Scalar)) {
                        continue;
                    }
                    long value = ((Scalar)object).getUnsignedValue();
                    if (value < low || value > high) {
                        continue;
                    }
                    Function function = getFunctionContaining(instruction.getAddress());
                    println("offset=" + Long.toHexString(value) +
                        " at=" + instruction.getAddress() +
                        " op=" + operand +
                        " function=" + (function == null ? "<none>" : function.getName()) +
                        " instruction=" + instruction);
                    matches++;
                }
            }
        }
        println("range=" + Long.toHexString(low) + ".." + Long.toHexString(high) +
            " matches=" + matches);
    }
}
